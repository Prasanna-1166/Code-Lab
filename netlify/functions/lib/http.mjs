// Small HTTP helpers shared by the API modules.

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB hard cap on any request body

export class HttpError extends Error {
  constructor(status, message, { headers = {}, extra = {} } = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.extra = extra;
  }
}

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

export async function readJson(req) {
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json.");
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large.");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return parsed;
}
