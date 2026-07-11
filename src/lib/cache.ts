/**
 * Simple in-memory TTL cache for server-side use.
 * Works across requests within the same Node.js process (warm Cloud Run instance).
 * Each key stores a value + expiry timestamp. Expired entries are evicted on read.
 */

type Entry<T> = { value: T; expires: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, Entry<any>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(key); return null; }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function cacheDel(...keys: string[]): void {
  keys.forEach((k) => store.delete(k));
}

export function cacheDel_prefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Convenience: get from cache or compute + cache the result. */
export async function cacheOr<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  cacheSet(key, value, ttlMs);
  return value;
}

export const TTL = {
  INTEGRATIONS:  2  * 60 * 1000,  // 2 min  — credentials rarely change
  AI_SETTINGS:   5  * 60 * 1000,  // 5 min  — KB + limits
  AI_INTENT:     10 * 60 * 1000,  // 10 min — same message → same intent
  WC_PRODUCTS:   5  * 60 * 1000,  // 5 min  — product search results
  WC_CATEGORIES: 2  * 60 * 1000,  // 2 min  — category list
};
