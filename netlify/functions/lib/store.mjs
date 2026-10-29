// Data-access module. The whole library is ONE JSON document in Netlify Blobs:
//   { version: 1, programs: [ ... ] }
// Every change reads the document, edits it, and writes it back only if nobody
// else changed it in the meantime (conditional write using the blob's ETag).
import { HttpError } from "./http.mjs";
import { SAMPLE_PROGRAMS } from "./samples.mjs";

const STORE_NAME = "lab-code-library";
const KEY = "library";
const MAX_ATTEMPTS = 6;

// Adapter around Netlify Blobs. @netlify/blobs is imported lazily so tests can
// run without it. Netlify Functions get the blob credentials automatically.
export function createBlobStore() {
  let storePromise;
  const getStore = () => {
    storePromise ??= import("@netlify/blobs").then((m) => m.getStore({ name: STORE_NAME, consistency: "strong" }));
    return storePromise;
  };
  return {
    async read() {
      const store = await getStore();
      const entry = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
      return entry ? { data: entry.data, etag: entry.etag } : null;
    },
    // condition: { onlyIfNew: true } or { etag }. Returns true if the write was applied.
    async write(data, condition = {}) {
      const store = await getStore();
      if (condition.onlyIfNew) {
        const existing = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
        if (existing) return false;
      } else if (condition.etag) {
        const existing = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
        if (existing && existing.etag !== condition.etag) return false;
      }
      await store.setJSON(KEY, data);
      return true;
    },
  };
}

const byOrder = (a, b) =>
  a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }) || a.experimentNumber - b.experimentNumber;

async function loadLibrary(store) {
  let current = await store.read();
  if (!current) {
    // First visit ever: seed the sample programs. If two requests race, only one write wins.
    await store.write({ version: 1, programs: structuredClone(SAMPLE_PROGRAMS) }, { onlyIfNew: true });
    current = await store.read();
  }
  if (!current || !Array.isArray(current.data?.programs)) {
    throw new Error("Stored library has an unexpected format.");
  }
  return current;
}

export async function listPrograms(store) {
  const { data } = await loadLibrary(store);
  return [...data.programs].sort(byOrder);
}

// mutate(programs) must return { programs: newArray, result: anything }.
// It may throw HttpError (e.g. 404 or 409); nothing is written in that case.
export async function updateLibrary(store, mutate) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await loadLibrary(store);
    const { programs, result } = mutate(structuredClone(data.programs));
    const applied = await store.write({ version: 1, programs }, { etag });
    if (applied) return result;
    await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1) + Math.random() * 30));
  }
  throw new HttpError(503, "The library is busy. Please try again in a moment.", { headers: { "retry-after": "2" } });
}
