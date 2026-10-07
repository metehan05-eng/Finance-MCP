// Hafif bellek-içi TTL cache ve yeniden deneme yardımcıları.
// Yahoo Finance sık zaman aşımı / 429 döndüğü için:
//  - kısa ömürlü önbellek aynı veriyi tekrar tekrar çekmeyi önler
//  - ağ hatalarında üstel geri çekilmeli (jitter'lı) tekrar denenir

interface Entry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

let hits = 0;
let misses = 0;
let evictions = 0;

/** Maksimum önbellek girdi sayısı (en eski yazılanlar silinir). */
const MAX_ENTRIES = 500;

function prune(now: number): void {
  for (const [k, e] of store) {
    if (e.expiresAt <= now) store.delete(k);
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

/** Önbellekten okur; yoksa null döner. */
export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) {
    misses++;
    return null;
  }
  if (e.expiresAt <= Date.now()) {
    store.delete(key);
    misses++;
    return null;
  }
  hits++;
  return e.value as T;
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
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;

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
