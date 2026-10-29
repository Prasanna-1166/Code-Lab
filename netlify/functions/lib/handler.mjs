// The whole API in one place. createHandler() takes its dependencies as arguments
// so tests can run it with an in-memory store.
import { randomUUID } from "node:crypto";
import { HttpError, json, readJson } from "./http.mjs";
import { SESSION_TTL_MS, createRateLimiter, isConfigured, passwordMatches, signSession, verifySession } from "./security.mjs";
import { LIMITS, languageList, validateProgram } from "./validate.mjs";
import { listPrograms, updateLibrary } from "./store.mjs";

const LOGIN_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const WRITE_LIMIT = { max: 60, windowMs: 60 * 1000 };
const sameText = (a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

export function createHandler({
  store,
  env = process.env,
  now = () => Date.now(),
  limiter = createRateLimiter(),
  failDelayMs = 400,
}) {
  function limit(key, rule) {
    const { allowed, retryAfterSeconds } = limiter.hit(key, rule.max, rule.windowMs, now());
    if (!allowed) {
      throw new HttpError(429, "Too many attempts. Wait a bit and try again.", {
        headers: { "retry-after": String(retryAfterSeconds) },
      });
    }
  }

  function requireAdmin(req, ip) {
    limit(`write:${ip}`, WRITE_LIMIT);
    if (!isConfigured(env)) throw new HttpError(503, "Admin access is not configured on the server.");
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = verifySession(env.SESSION_SECRET, token, now());
    if (!session) {
      throw new HttpError(401, "Your admin session is missing or has expired. Sign in again.", {
        headers: { "www-authenticate": "Bearer" },
      });
    }
    return session;
  }

  function checkUnique(programs, subject, number, ignoreId) {
    const clash = programs.find((p) => p.id !== ignoreId && sameText(p.subject, subject) && p.experimentNumber === number);
    if (clash) {
      throw new HttpError(409, `${clash.subject} already has an Experiment ${number}.`, {
        extra: { fields: { experimentNumber: "This number is already used in this subject." } },
      });
    }
  }

  // Reuse the spelling of an existing subject so "dbms" and "DBMS" don't split into two.
  const canonicalSubject = (programs, subject) => programs.find((p) => sameText(p.subject, subject))?.subject ?? subject;

  async function route(req, context) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
    const method = req.method.toUpperCase();
    const methodNotAllowed = (allow) => new HttpError(405, "Method not allowed.", { headers: { allow } });

    if (path === "/api/programs") {
      if (method === "GET") {
        const programs = await listPrograms(store);
        return json(200, { programs, languages: languageList(), limits: LIMITS });
      }
      if (method === "POST") {
        requireAdmin(req, ip);
        const input = validateProgram(await readJson(req));
        const created = await updateLibrary(store, (programs) => {
          const subject = canonicalSubject(programs, input.subject);
          checkUnique(programs, subject, input.experimentNumber, null);
          const stamp = new Date(now()).toISOString();
          const program = { id: randomUUID(), ...input, subject, createdAt: stamp, updatedAt: stamp };
          return { programs: [...programs, program], result: program };
        });
        return json(201, { program: created });
      }
      throw methodNotAllowed("GET, POST");
    }

    const match = path.match(/^\/api\/programs\/([A-Za-z0-9_-]{1,64})$/);
    if (match) {
      const id = match[1];
      if (method === "PUT") {
        requireAdmin(req, ip);
        const body = await readJson(req);
        const input = validateProgram(body);
        const updated = await updateLibrary(store, (programs) => {
          const index = programs.findIndex((p) => p.id === id);
          if (index === -1) throw new HttpError(404, "That program no longer exists.");
          const existing = programs[index];
          if (body.expectedUpdatedAt && body.expectedUpdatedAt !== existing.updatedAt) {
            throw new HttpError(409, "Someone else changed this program after you opened it. Reload and try again.");
          }
          const subject = canonicalSubject(programs.filter((p) => p.id !== id), input.subject);
          checkUnique(programs, subject, input.experimentNumber, id);
          const program = { ...existing, ...input, subject, id, createdAt: existing.createdAt, updatedAt: new Date(now()).toISOString() };
          const next = [...programs];
          next[index] = program;
          return { programs: next, result: program };
        });
        return json(200, { program: updated });
      }
      if (method === "DELETE") {
        requireAdmin(req, ip);
        await updateLibrary(store, (programs) => {
          if (!programs.some((p) => p.id === id)) throw new HttpError(404, "That program no longer exists.");
          return { programs: programs.filter((p) => p.id !== id), result: true };
        });
        return json(200, { deleted: true });
      }
      throw methodNotAllowed("PUT, DELETE");
    }

    if (path === "/api/login") {
      if (method !== "POST") throw methodNotAllowed("POST");
      limit(`login:${ip}`, LOGIN_LIMIT);
      if (!isConfigured(env)) {
        throw new HttpError(503, "Admin access is not configured. Set ADMIN_PASSWORD and SESSION_SECRET (32+ characters).");
      }
      const body = await readJson(req);
      if (typeof body.password !== "string" || !passwordMatches(body.password, env.ADMIN_PASSWORD)) {
        if (failDelayMs) await new Promise((resolve) => setTimeout(resolve, failDelayMs));
        throw new HttpError(401, "Incorrect password.");
      }
      const { token, expiresAt } = signSession(env.SESSION_SECRET, now());
      return json(200, { token, expiresAt, expiresInSeconds: SESSION_TTL_MS / 1000 });
    }

    if (path === "/api/session") {
      if (method !== "GET") throw methodNotAllowed("GET");
      const session = requireAdmin(req, ip);
      return json(200, { ok: true, expiresAt: session.expiresAt });
    }

    throw new HttpError(404, "Not found.");
  }

  return async function handle(req, context) {
    try {
      return await route(req, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, ...err.extra }, err.headers);
      }
      console.error("Unhandled API error:", err);
      return json(500, { error: "Something went wrong on the server. Try again." });
    }
  };
}
