export const PUBLIC_CONTENT_CACHE_TTL_SECONDS = 60;

const INTERNAL_CACHE_ORIGIN = "https://jehmarp.internal/cache";

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const memoryStore = new Map<string, MemoryEntry>();

export function buildPublicPageCacheKey(slug: string) {
  return `public-page:${slug}`;
}

export function buildPublicFeaturedProductsCacheKey(limit: number) {
  return `public-featured-products:${limit}`;
}

export function resetPublicContentCacheForTests() {
  memoryStore.clear();
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const edgeValue = await readEdgeCache(key);
  if (edgeValue !== null) {
    return parseCachedJson<T>(edgeValue);
  }

  const memoryValue = readMemoryCache(key);
  if (memoryValue === null) {
    return null;
  }

  return parseCachedJson<T>(memoryValue);
}

export async function setCachedJson<T>(
  key: string,
  value: T,
  ttlSeconds = PUBLIC_CONTENT_CACHE_TTL_SECONDS,
): Promise<void> {
  const serialized = JSON.stringify(value);
  writeMemoryCache(key, serialized, ttlSeconds);
  await writeEdgeCache(key, serialized, ttlSeconds);
}

export async function deleteCachedJson(key: string): Promise<void> {
  memoryStore.delete(key);
  await deleteEdgeCache(key);
}

function readMemoryCache(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }

  return entry.value;
}

function writeMemoryCache(key: string, value: string, ttlSeconds: number) {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function parseCachedJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getEdgeCache(): Cache | null {
  if (typeof caches === "undefined") {
    return null;
  }

  const edgeCache = (caches as CacheStorage & { default?: Cache }).default;
  return edgeCache ?? null;
}

function buildEdgeCacheRequest(key: string) {
  return new Request(`${INTERNAL_CACHE_ORIGIN}/${encodeURIComponent(key)}`);
}

async function readEdgeCache(key: string): Promise<string | null> {
  const cache = getEdgeCache();
  if (!cache) {
    return null;
  }

  const response = await cache.match(buildEdgeCacheRequest(key));
  if (!response) {
    return null;
  }

  return response.text();
}

async function writeEdgeCache(key: string, value: string, ttlSeconds: number) {
  const cache = getEdgeCache();
  if (!cache) {
    return;
  }

  const response = new Response(value, {
    headers: {
      "Cache-Control": `max-age=${ttlSeconds}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  await cache.put(buildEdgeCacheRequest(key), response);
}

async function deleteEdgeCache(key: string) {
  const cache = getEdgeCache();
  if (!cache) {
    return;
  }

  await cache.delete(buildEdgeCacheRequest(key));
}
