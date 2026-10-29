// Backend tests: run the real API handler against an in-memory store.
// These do NOT touch Netlify Blobs; see README "What was and was not verified".
import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../netlify/functions/lib/handler.mjs";
import { createRateLimiter } from "../netlify/functions/lib/security.mjs";

const ENV = { ADMIN_PASSWORD: "test-password-123", SESSION_SECRET: "s".repeat(40) };

// In-memory store with the same contract as the Blobs adapter (ETag conditional writes).
function memoryStore() {
  let doc = null;
  let version = 0;
  return {
    async read() {
      await Promise.resolve();
      return doc ? { data: structuredClone(doc), etag: String(version) } : null;
    },
    async write(data, cond) {
      await new Promise((r) => setTimeout(r, 1)); // let concurrent requests interleave
      if (cond.onlyIfNew && doc) return false;
      if (cond.etag && cond.etag !== String(version)) return false;
      doc = structuredClone(data);
      version += 1;
      return true;
    },
  };
}

function setup(overrides = {}) {
  const clock = { t: Date.parse("2026-10-29T10:00:00Z") };
  const handler = createHandler({
    store: memoryStore(), env: ENV, now: () => clock.t, failDelayMs: 0, limiter: createRateLimiter(), ...overrides,
  });
  const call = (method, path, { body, token, ip = "1.1.1.1", raw, type = "application/json" } = {}) =>
    handler(
      new Request(`https://example.test${path}`, {
        method,
        headers: { ...(body !== undefined || raw !== undefined ? { "content-type": type } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      }),
      { ip },
    );
  const login = async () => (await (await call("POST", "/api/login", { body: { password: ENV.ADMIN_PASSWORD } })).json()).token;
  return { call, login, clock };
}

const program = (o = {}) => ({ subject: "Networks", experimentNumber: 1, title: "Ping", language: "python", description: "", code: "print('hi')", ...o });

test("public list seeds sample programs and includes languages", async () => {
  const { call } = setup();
  const res = await call("GET", "/api/programs");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.programs.length >= 5);
  assert.ok(body.languages.some((l) => l.id === "python" && l.ext === "py"));
  assert.equal(body.limits.maxCodeBytes, 512000);
});

test("mutations without a token are rejected with 401", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/api/programs", { body: program() })).status, 401);
  assert.equal((await call("PUT", "/api/programs/sample-ds-1", { body: program() })).status, 401);
  assert.equal((await call("DELETE", "/api/programs/sample-ds-1")).status, 401);
  assert.equal((await call("GET", "/api/session")).status, 401);
});

test("invalid, tampered and expired tokens are rejected", async () => {
  const { call, login, clock } = setup();
  assert.equal((await call("POST", "/api/programs", { body: program(), token: "garbage" })).status, 401);
  const token = await login();
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ exp: clock.t + 9e9 })).toString("base64url");
  assert.equal((await call("GET", "/api/session", { token: `${forged}.${sig}` })).status, 401);
  assert.equal((await call("GET", "/api/session", { token: `${payload}.${sig.slice(0, -2)}xx` })).status, 401);
  assert.equal((await call("GET", "/api/session", { token })).status, 200);
  clock.t += 61 * 60 * 1000;
  assert.equal((await call("GET", "/api/session", { token })).status, 401);
});

test("login: wrong password 401, correct password returns a token, secrets never returned", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/api/login", { body: { password: "nope" } })).status, 401);
  const res = await call("POST", "/api/login", { body: { password: ENV.ADMIN_PASSWORD } });
  assert.equal(res.status, 200);
  const text = JSON.stringify(await res.json());
  assert.ok(!text.includes(ENV.ADMIN_PASSWORD) && !text.includes(ENV.SESSION_SECRET));
});

test("login is rate limited", async () => {
  const { call } = setup();
  let last;
  for (let i = 0; i < 11; i++) last = await call("POST", "/api/login", { body: { password: "bad" }, ip: "9.9.9.9" });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
  assert.equal((await call("POST", "/api/login", { body: { password: ENV.ADMIN_PASSWORD }, ip: "8.8.8.8" })).status, 200);
});

test("admin is refused when env vars are missing or the secret is too short", async () => {
  const none = setup({ env: {} });
  assert.equal((await none.call("POST", "/api/login", { body: { password: "x" } })).status, 503);
  const short = setup({ env: { ADMIN_PASSWORD: "abc", SESSION_SECRET: "short" } });
  assert.equal((await short.call("POST", "/api/login", { body: { password: "abc" } })).status, 503);
});

test("create, update, delete work and persist across requests", async () => {
  const { call, login } = setup();
  const token = await login();
  const created = await call("POST", "/api/programs", { body: program(), token });
  assert.equal(created.status, 201);
  const { program: p } = await created.json();
  assert.ok(p.id && p.createdAt && p.updatedAt);

  const listed = await (await call("GET", "/api/programs", { ip: "2.2.2.2" })).json();
  assert.ok(listed.programs.some((x) => x.id === p.id));

  const upd = await call("PUT", `/api/programs/${p.id}`, { body: { ...program({ title: "Ping v2" }), expectedUpdatedAt: p.updatedAt }, token });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).program.title, "Ping v2");

  assert.equal((await call("DELETE", `/api/programs/${p.id}`, { token })).status, 200);
  assert.equal((await call("DELETE", `/api/programs/${p.id}`, { token })).status, 404);
  assert.equal((await call("PUT", `/api/programs/${p.id}`, { body: program(), token })).status, 404);
});

test("duplicate experiment numbers in one subject are rejected (case-insensitive), other subjects are fine", async () => {
  const { call, login } = setup();
  const token = await login();
  assert.equal((await call("POST", "/api/programs", { body: program(), token })).status, 201);
  assert.equal((await call("POST", "/api/programs", { body: program({ subject: "  networks " }), token })).status, 409);
  assert.equal((await call("POST", "/api/programs", { body: program({ subject: "Compilers" }), token })).status, 201);
  const two = await (await call("POST", "/api/programs", { body: program({ experimentNumber: 2 }), token })).json();
  const clash = await call("PUT", `/api/programs/${two.program.id}`, { body: program({ experimentNumber: 1 }), token });
  assert.equal(clash.status, 409);
  const ok = await call("PUT", `/api/programs/${two.program.id}`, { body: program({ experimentNumber: 5 }), token });
  assert.equal(ok.status, 200);
});

test("stale edits are refused instead of silently overwriting", async () => {
  const { call, login } = setup();
  const token = await login();
  const { program: p } = await (await call("POST", "/api/programs", { body: program(), token })).json();
  assert.equal((await call("PUT", `/api/programs/${p.id}`, { body: { ...program(), expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }, token })).status, 409);
});

test("validation failures return 400 with field messages", async () => {
  const { call, login } = setup();
  const token = await login();
  const bad = [
    program({ subject: "" }), program({ title: "x" }), program({ experimentNumber: 0 }), program({ experimentNumber: "abc" }),
    program({ language: "brainfuck" }), program({ code: "   " }), program({ code: "abc\u0000def" }), program({ description: "x".repeat(301) }),
    program({ subject: "Bell\u0007ring" }),
  ];
  for (const body of bad) {
    const res = await call("POST", "/api/programs", { body, token });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.ok(Object.keys((await res.json()).fields).length > 0);
  }
});

test("oversized code and oversized bodies return 413; wrong content type 415; bad JSON 400", async () => {
  const { call, login } = setup();
  const token = await login();
  assert.equal((await call("POST", "/api/programs", { body: program({ code: "a".repeat(500 * 1024 + 1) }), token })).status, 413);
  assert.equal((await call("POST", "/api/programs", { body: program({ code: "a".repeat(500 * 1024) }), token })).status, 201);
  assert.equal((await call("POST", "/api/programs", { raw: "x".repeat(1024 * 1024 + 10), token })).status, 413);
  assert.equal((await call("POST", "/api/programs", { raw: "{}", type: "text/plain", token })).status, 415);
  assert.equal((await call("POST", "/api/programs", { raw: "{not json", token })).status, 400);
});

test("script-like content is stored as plain text, unchanged", async () => {
  const { call, login } = setup();
  const token = await login();
  const code = "<script>alert('x')</script>\n<img src=x onerror=alert(1)>";
  const { program: p } = await (await call("POST", "/api/programs", { body: program({ language: "html", code, title: "<b>Hi</b>" }), token })).json();
  assert.equal(p.code, code);
  assert.equal(p.title, "<b>Hi</b>"); // escaping is the frontend's job (textContent only)
});

test("simultaneous creates both succeed and neither overwrites the other", async () => {
  const { call, login } = setup();
  const token = await login();
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => call("POST", "/api/programs", { body: program({ subject: "Race", experimentNumber: i + 1, title: `Exp ${i + 1}` }), token })),
  );
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201, 201]);
  const list = await (await call("GET", "/api/programs")).json();
  assert.equal(list.programs.filter((p) => p.subject === "Race").length, 6);
});

test("deleting every program does not bring the samples back", async () => {
  const { call, login } = setup();
  const token = await login();
  const { programs } = await (await call("GET", "/api/programs")).json();
  for (const p of programs) assert.equal((await call("DELETE", `/api/programs/${p.id}`, { token })).status, 200);
  assert.equal((await (await call("GET", "/api/programs")).json()).programs.length, 0);
});

test("unknown routes 404 and wrong methods 405", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/api/nothing")).status, 404);
  assert.equal((await call("PATCH", "/api/programs")).status, 405);
  assert.equal((await call("GET", "/api/login")).status, 405);
});
