// Netlify Function (v2). Served at /api/* — see `config.path` below.
import { createHandler } from "./lib/handler.mjs";
import { createBlobStore } from "./lib/store.mjs";

export default createHandler({ store: createBlobStore() });

export const config = { path: "/api/*" };
