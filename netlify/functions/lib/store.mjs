// Data-access module. The whole library is ONE JSON document in Netlify Blobs:
//   { version: 1, programs: [ ... ], analytics: { ... } }
// Every change reads the document, edits it, and writes it back only if nobody
// else changed it in the meantime (conditional write using the blob's ETag).
import { createHash } from "node:crypto";
import { HttpError } from "./http.mjs";
import { SAMPLE_PROGRAMS } from "./samples.mjs";

const STORE_NAME = "lab-code-library";
const KEY = "library";
const MAX_ATTEMPTS = 6;

export function defaultAnalytics() {
  return {
    totalVisits: 0,
    uniqueVisitors: 0,
    daily: {},
    viewsByExperiment: {},
    recentVisits: [],
    visitorHashes: [],
  };
}

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
    // First visit ever: seed the sample programs and initial analytics.
    await store.write({ version: 1, programs: structuredClone(SAMPLE_PROGRAMS), analytics: defaultAnalytics() }, { onlyIfNew: true });
    current = await store.read();
  }
  if (!current || !Array.isArray(current.data?.programs)) {
    throw new Error("Stored library has an unexpected format.");
  }
  if (!current.data.analytics) {
    current.data.analytics = defaultAnalytics();
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
    const applied = await store.write({ version: 1, programs, analytics: data.analytics || defaultAnalytics() }, { etag });
    if (applied) return result;
    await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1) + Math.random() * 30));
  }
  throw new HttpError(503, "The library is busy. Please try again in a moment.", { headers: { "retry-after": "2" } });
}

export async function getAnalytics(store) {
  const { data } = await loadLibrary(store);
  return data.analytics || defaultAnalytics();
}

export async function recordVisit(store, { path = "/", experimentId = null, ip = "unknown", userAgent = "", now = Date.now() } = {}) {
  const dayStr = new Date(now).toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${ip}:${dayStr.slice(0, 7)}`).digest("hex").slice(0, 12);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await loadLibrary(store);
    const analytics = structuredClone(data.analytics || defaultAnalytics());

    analytics.totalVisits = (analytics.totalVisits || 0) + 1;

    analytics.daily = analytics.daily || {};
    if (!analytics.daily[dayStr]) {
      analytics.daily[dayStr] = { visits: 0, uniques: [] };
    }
    analytics.daily[dayStr].visits = (analytics.daily[dayStr].visits || 0) + 1;
    analytics.daily[dayStr].uniques = analytics.daily[dayStr].uniques || [];
    if (!analytics.daily[dayStr].uniques.includes(ipHash)) {
      analytics.daily[dayStr].uniques.push(ipHash);
    }

    analytics.visitorHashes = analytics.visitorHashes || [];
    if (!analytics.visitorHashes.includes(ipHash)) {
      analytics.visitorHashes.push(ipHash);
    }
    analytics.uniqueVisitors = analytics.visitorHashes.length;

    if (analytics.visitorHashes.length > 5000) {
      analytics.visitorHashes = analytics.visitorHashes.slice(-5000);
    }

    if (experimentId) {
      analytics.viewsByExperiment = analytics.viewsByExperiment || {};
      analytics.viewsByExperiment[experimentId] = (analytics.viewsByExperiment[experimentId] || 0) + 1;
    }

    let device = "Desktop";
    if (/mobile|android|iphone/i.test(userAgent)) device = "Mobile";
    else if (/tablet|ipad/i.test(userAgent)) device = "Tablet";

    const visitEntry = {
      timestamp: new Date(now).toISOString(),
      path: String(path).slice(0, 80),
      experimentId: experimentId ? String(experimentId).slice(0, 60) : null,
      device,
    };

    analytics.recentVisits = [visitEntry, ...(analytics.recentVisits || [])].slice(0, 50);

    const applied = await store.write({ version: 1, programs: data.programs, analytics }, { etag });
    if (applied) return analytics;
    await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1) + Math.random() * 20));
  }
  return null;
}
