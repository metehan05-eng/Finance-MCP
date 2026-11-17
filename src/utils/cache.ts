// Hafif bellek-içi TTL cache ve yeniden deneme yardımcıları.
// Yahoo Finance sık zaman aşımı / 429 döndüğü için:
//  - kısa ömürlü önbellek aynı veriyi tekrar tekrar çekmeyi önler
//  - ağ hatalarında üstel geri çekilmeli (jitter'lı) tekrar denenir

interface Entry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheResult<T> {
  value: T;
  cacheStatus: "miss" | "hit" | "shared" | "stale";
  fetchedAt: string;
  ageSeconds: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

let hits = 0;
let misses = 0;
let evictions = 0;

/** Maksimum önbellek girdi sayısı (en eski yazılanlar silinir). */
const MAX_ENTRIES = 500;
const STALE_RETENTION_SECONDS = 24 * 60 * 60;

function prune(now: number): void {
  for (const [k, e] of store) {
    if (e.expiresAt + STALE_RETENTION_SECONDS * 1000 <= now) store.delete(k);
  }
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let i = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++i >= excess) break;
    }
    evictions += excess;
  }
}

/**
 * Önbellekten okur. `found` hem "girdi var" hem değeri döndürür; böylece
 * önbelleğe alınmış `null` sonuç ile "önbellekte yok" ayırt edilebilir.
 */
function lookup<T>(key: string): { found: boolean; value: T | null } {
  const e = store.get(key);
  if (!e) {
    misses++;
    return { found: false, value: null };
  }
  if (e.expiresAt <= Date.now()) {
    misses++;
    return { found: false, value: null };
  }
  hits++;
  return { found: true, value: e.value as T };
}

/** Önbellekten okur; yoksa null döner. */
export function cacheGet<T>(key: string): T | null {
  return lookup<T>(key).value;
}

/** Önbelleğe yazar. */
export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  const now = Date.now();
  store.set(key, { value, createdAt: now, expiresAt: now + ttlSeconds * 1000 });
  prune(now);
}

/** Tek bir anahtarı önbellekten siler (hatalı yanıtların saklanmaması için). */
export function cacheDelete(key: string): void {
  store.delete(key);
}

/** Tüm önbelleği temizler (get_data_health aracı ve testler için). */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
}

export function cacheStats() {
  const now = Date.now();
  prune(now);
  let fresh = 0;
  let stale = 0;
  for (const e of store.values()) {
    if (e.expiresAt > now) fresh++;
    else stale++;
  }
  return { entries: store.size, fresh, stale, hits, misses, evictions };
}

/**
 * Aynı anahtar için eşzamanlı istekleri tekilleştirir (thundering herd koruması).
 * `fn` yalnızca bir kez çalışır; sonuç TTL boyunca önbelleklenir.
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = lookup<T>(key);
  if (hit.found) return hit.value as T;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const promise = fn()
    .then((value) => {
      cacheSet(key, value, ttlSeconds);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** TTL dolduktan sonra son başarılı kopyayı 24 saat tutar; yalnızca yenileme
 * başarısız olursa açıkça "stale" olarak döndürür. */
export async function cachedWithInfo<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<CacheResult<T>> {
  const now = Date.now();
  let entry = store.get(key) as Entry<T> | undefined;
  if (entry && entry.expiresAt + STALE_RETENTION_SECONDS * 1000 <= now) {
    store.delete(key);
    entry = undefined;
  }
  if (entry && entry.expiresAt > now) {
    hits++;
    return result(entry, "hit", now);
  }
  misses++;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) {
    try {
      const value = await running;
      const current = store.get(key) as Entry<T> | undefined;
      return current
        ? result(current, "shared", Date.now())
        : {
            value,
            cacheStatus: "shared",
            fetchedAt: new Date().toISOString(),
            ageSeconds: 0,
          };
    } catch (err) {
      return staleOrThrow(entry, err);
    }
  }

  const promise = fn()
    .then((value) => {
      cacheSet(key, value, ttlSeconds);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);

  try {
    const value = await promise;
    const current = store.get(key) as Entry<T>;
    return result(current, "miss", Date.now(), value);
  } catch (err) {
    return staleOrThrow(entry, err);
  }
}

function result<T>(
  entry: Entry<T>,
  cacheStatus: CacheResult<T>["cacheStatus"],
  now: number,
  value = entry.value
): CacheResult<T> {
  return {
    value,
    cacheStatus,
    fetchedAt: new Date(entry.createdAt).toISOString(),
    ageSeconds: Math.max(0, Math.floor((now - entry.createdAt) / 1000)),
  };
}

function staleOrThrow<T>(entry: Entry<T> | undefined, err: unknown): CacheResult<T> {
  if (entry && entry.expiresAt + STALE_RETENTION_SECONDS * 1000 > Date.now()) {
    return result(entry, "stale", Date.now());
  }
  throw err;
}

/** Yeniden denenebilir ağ hataları. */
export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|network|429|rate limit|Schema validation/i.test(
    msg
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Üstel geri çekilmeli (jitter'lı) tekrar deneme.
 * Yalnızca yeniden denenebilir ağ hatalarında tekrar dener.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 400;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryableError(err)) throw err;
      const jitter = Math.floor(Math.random() * 200);
      const wait = base * Math.pow(2, i) + jitter;
      if (opts.label) {
        console.error(
          `[retry] ${opts.label}: ${i + 1}/${attempts} başarısız, ${wait}ms sonra tekrar`
        );
      }
      await sleep(wait);
    }
  }
  throw lastErr;
}
