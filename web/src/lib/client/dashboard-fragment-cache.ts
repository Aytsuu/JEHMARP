type DashboardFragmentCacheEntry = {
  query: string;
  fragmentHtml: string;
  savedAt: number;
};

type DashboardFragmentCacheStore = {
  version: 1;
  entries: DashboardFragmentCacheEntry[];
};

const cachePrefix = "dashboard-fragment-cache:";
const defaultMaxEntries = 12;

function storageKeyFor(cacheKey: string) {
  return `${cachePrefix}${cacheKey}`;
}

function readStore(cacheKey: string): DashboardFragmentCacheStore {
  try {
    const rawValue = sessionStorage.getItem(storageKeyFor(cacheKey));
    if (!rawValue) return { version: 1, entries: [] };

    const parsed = JSON.parse(rawValue) as Partial<DashboardFragmentCacheStore>;
    if (!Array.isArray(parsed.entries)) return { version: 1, entries: [] };

    const entries = parsed.entries.filter(
      (entry): entry is DashboardFragmentCacheEntry =>
        typeof entry?.query === "string" &&
        typeof entry.fragmentHtml === "string" &&
        typeof entry.savedAt === "number",
    );

    return { version: 1, entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeStore(cacheKey: string, store: DashboardFragmentCacheStore) {
  try {
    sessionStorage.setItem(storageKeyFor(cacheKey), JSON.stringify(store));
  } catch {
    // Browsers can reject sessionStorage writes in private mode or quota pressure.
  }
}

export function readDashboardFragmentCache(
  cacheKey: string,
  query: string,
): string | undefined {
  return readStore(cacheKey).entries.find((entry) => entry.query === query)
    ?.fragmentHtml;
}

export function writeDashboardFragmentCache(
  cacheKey: string,
  query: string,
  fragmentHtml: string,
  maxEntries = defaultMaxEntries,
) {
  const existingEntries = readStore(cacheKey).entries.filter(
    (entry) => entry.query !== query,
  );
  const nextEntries = [
    { query, fragmentHtml, savedAt: Date.now() },
    ...existingEntries,
  ]
    .sort((first, second) => second.savedAt - first.savedAt)
    .slice(0, maxEntries);

  writeStore(cacheKey, { version: 1, entries: nextEntries });
}

export function clearDashboardFragmentCaches() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(cachePrefix))
      .forEach((key) => {
        sessionStorage.removeItem(key);
      });
  } catch {
    // Browsers can reject sessionStorage access in private mode.
  }
}
