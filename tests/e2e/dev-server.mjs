import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler } from "../../netlify/functions/lib/handler.mjs";

let doc = null, v = 0;
const store = {
  async read() { return doc ? { data: structuredClone(doc), etag: String(v) } : null; },
  async write(d, c) {
    if (c.onlyIfNew && doc) return false;
    if (c.etag && c.etag !== String(v)) return false;
    doc = structuredClone(d);
    v++;
    return true;
  }
};

const handler = createHandler({ store, env: { ADMIN_PASSWORD: "e2e-password", SESSION_SECRET: "k".repeat(48) }, failDelayMs: 0 });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8888");
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ip: "127.0.0.1" });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let p = url.pathname === "/" ? "/index.html" : url.pathname === "/admin" || url.pathname === "/admin/" ? "/admin.html" : url.pathname;
  try {
    const filePath = path.join(ROOT, p.replace(/^\/+/, ""));
    const b = await readFile(filePath);
    res.writeHead(200, { "content-type": types[path.extname(p)] || "text/plain", "content-security-policy": CSP });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end("nf");
  }
}).listen(8888, () => console.log("up"));
