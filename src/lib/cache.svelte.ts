/**
 * SWR-style resource cache for Tauri-backed data fetches.
 *
 * - First call to `cachedResource(key, fetcher)` triggers a fetch; `loading` is true.
 * - Subsequent calls with the same key reuse the cached data immediately; if it's
 *   older than `ttl`, a background refresh runs and `revalidating` flips to true.
 * - `preloadResource(key, fetcher)` is fire-and-forget — useful for sidebar hover
 *   warmups so the data is already there when the user actually clicks.
 *
 * Entries persist for the lifetime of the browser session (memory only). Use
 * `invalidate(key)` after a mutation that would make the cached data wrong.
 */

type Entry<T> = {
  data: T | undefined;
  loading: boolean;
  revalidating: boolean;
  error: unknown;
  lastFetched: number;
  inflight: Promise<T> | null;
  version: string | null;
  /** Bumped whenever the entry is invalidated or its version changes. A fetch
   * that returns with a stale generation is discarded. */
  generation: number;
};

const DEFAULT_TTL = 60_000;

const entries = new Map<string, Entry<unknown>>();

function getOrCreate<T>(key: string): Entry<T> {
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing) return existing;
  // `$state(...)` is only valid as a variable declaration initializer in
  // function bodies — that's why we can't do `e = $state(...)` above.
  const fresh: Entry<T> = $state({
    data: undefined,
    loading: false,
    revalidating: false,
    error: undefined,
    lastFetched: 0,
    inflight: null,
    version: null,
    generation: 0,
  });
  entries.set(key, fresh as Entry<unknown>);
  return fresh;
}

export type Resource<T> = {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly revalidating: boolean;
  readonly error: unknown;
  refresh: () => Promise<T | undefined>;
};

export type CacheOptions = {
  /** Background-refresh threshold in ms. 0 disables auto revalidate. */
  ttl?: number;
  /** If true (default), revalidates on mount when cached data is older than ttl. */
  revalidateOnMount?: boolean;
  /** Identity of the fetcher's inputs. When this changes, the cache is treated
   * as stale and the fetcher is rerun. Use for resources that depend on other
   * resources (e.g. icons keyed by the installed-apps list). */
  version?: string;
};

async function runFetch<T>(
  entry: Entry<T>,
  fetcher: () => Promise<T>,
  isFirst: boolean,
): Promise<T | undefined> {
  if (entry.inflight) {
    try {
      return await entry.inflight;
    } catch {
      return undefined;
    }
  }
  if (isFirst) entry.loading = true;
  else entry.revalidating = true;
  entry.error = undefined;
  const generation = entry.generation;
  const promise = fetcher();
  entry.inflight = promise;
  try {
    const result = await promise;
    if (entry.generation !== generation) return undefined;
    entry.data = result;
    entry.lastFetched = Date.now();
    return result;
  } catch (err) {
    if (entry.generation !== generation) return undefined;
    entry.error = err;
    return undefined;
  } finally {
    if (entry.generation === generation) {
      entry.inflight = null;
      entry.loading = false;
      entry.revalidating = false;
    }
  }
}

export function cachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions = {},
): Resource<T> {
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const version = opts.version ?? null;
  const entry = getOrCreate<T>(key);

  // Defer state mutations + fetch kickoff to a microtask. cachedResource is
  // routinely called from inside `$derived` (e.g. iconsRes depends on the
  // installed-apps list), and Svelte 5 forbids state writes during derived
  // evaluation. Mutating here directly throws `state_unsafe_mutation` the
  // moment a version change happens — which is exactly what occurs right
  // after the user removes a bloatware app and the icons resource re-keys.
  queueMicrotask(() => {
    const versionChanged = version !== null && entry.version !== version;
    if (versionChanged) {
      entry.data = undefined;
      entry.lastFetched = 0;
      entry.error = undefined;
      entry.version = version;
      entry.generation++;
      entry.inflight = null;
      entry.loading = false;
      entry.revalidating = false;
    }
    const hasData = entry.data !== undefined;
    const stale = ttl > 0 && Date.now() - entry.lastFetched > ttl;
    const shouldRevalidate = opts.revalidateOnMount !== false && hasData && stale;

    if (!hasData && !entry.inflight) {
      void runFetch(entry, fetcher, true);
    } else if (shouldRevalidate && !entry.inflight) {
      void runFetch(entry, fetcher, false);
    }
  });

  return {
    get data() {
      return entry.data;
    },
    get loading() {
      return entry.loading;
    },
    get revalidating() {
      return entry.revalidating;
    },
    get error() {
      return entry.error;
    },
    refresh: () => runFetch(entry, fetcher, entry.data === undefined),
  };
}

/** Fire-and-forget warmup. Idempotent: skips if cache is fresh or already
 * loading. Returns a promise that resolves when the fetch completes (or
 * immediately if nothing needed to run) — callers may await for staggered
 * execution, or ignore the return for true fire-and-forget. */
export function preloadResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions = {},
): Promise<void> {
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const entry = getOrCreate<T>(key);
  if (entry.inflight) return entry.inflight.then(noop, noop);
  const fresh = entry.data !== undefined && ttl > 0 && Date.now() - entry.lastFetched < ttl;
  if (fresh) return Promise.resolve();
  return runFetch(entry, fetcher, entry.data === undefined).then(noop, noop);
}

function noop() {}

/** Drop the cached value so the next read fetches again. */
export function invalidate(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entry.data = undefined;
  entry.lastFetched = 0;
  entry.error = undefined;
  entry.generation++;
  entry.inflight = null;
  entry.loading = false;
  entry.revalidating = false;
}

/** Replace the cached value without going through the fetcher. Useful after a
 * local mutation when you know the new value. */
export function setCached<T>(key: string, value: T): void {
  const entry = getOrCreate<T>(key);
  entry.data = value;
  entry.lastFetched = Date.now();
  entry.error = undefined;
}
