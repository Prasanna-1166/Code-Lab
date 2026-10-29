// Password check, signed short-lived sessions, and a basic rate limiter.
// Uses only Node's built-in crypto module.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 60 * 60 * 1000; // sessions last 1 hour

export function isConfigured(env) {
  return (
    typeof env.ADMIN_PASSWORD === "string" &&
    env.ADMIN_PASSWORD.length > 0 &&
    typeof env.SESSION_SECRET === "string" &&
    env.SESSION_SECRET.length >= 32
  );
}

// Hash both sides first so the comparison always sees equal-length buffers.
export function passwordMatches(input, expected) {
  const a = createHash("sha256").update(String(input)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

const sign = (secret, payload) => createHmac("sha256", secret).update(payload).digest();

export function signSession(secret, now) {
  const expiresAt = now + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt, n: randomBytes(8).toString("hex") })).toString("base64url");
  const token = `${payload}.${sign(secret, payload).toString("base64url")}`;
  return { token, expiresAt };
}

// Returns { expiresAt } for a valid, unexpired token, otherwise null.
export function verifySession(secret, token, now) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = sign(secret, payload);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof exp !== "number" || exp <= now) return null;
    return { expiresAt: exp };
  } catch {
    return null;
  }
}

// In-memory limiter. Netlify may run several function instances, so this is a
// best-effort brake on abuse, not a hard guarantee.
export function createRateLimiter() {
  const buckets = new Map();
  return {
    hit(key, limit, windowMs, now) {
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    },
  };
}
