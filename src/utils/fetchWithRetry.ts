import { cached, cacheDelete } from "./cache.js";
import { assertBreakerClosed, recordFailure, recordSuccess } from "./httpCircuit.js";

/**
 * Exponential backoff ile HTTP isteği atar.
 * - 3 deneme hakkı
 * - Her denemede 10 saniyelik timeout
 * - 429 (rate limit) yanıtında otomatik bekleme
 */
/**
 * Kaynak bazlı önbellek süreleri (saniye):
 * - 60 sn: anlık fiyat / kur verileri
 * - 300 sn: sektör ve piyasa özetleri
 * - 1800 sn: seyrek değişen tablolar (politika faizi, enflasyon)
 * - 3600 sn: yıllık veri (dünya bankası)
 */
const HOST_TTL: Record<string, number> = {
  "api.coingecko.com": 60,
  "api.frankfurter.app": 300,
  "api.worldbank.org": 3600,
  "www.tcmb.gov.tr": 1800,
  "www.tefas.gov.tr": 300,
  "doviz.com": 60,
  "api.alternative.me": 300,
  "nfs.faireconomy.media": 300,
  "feeds.finance.yahoo.com": 300,
};

const DEFAULT_TTL = 300;

/** Önbellekte saklanan gövde (Response yerine, çünkü gövde tek sefer okunur). */
interface CachedBody {
  status: number;
  statusText: string;
  body: string;
  contentType: string;
}

export function resolveTtl(url: string): number {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return DEFAULT_TTL;
  }
  return HOST_TTL[host] ?? DEFAULT_TTL;
}

/**
 * Exponential backoff ile HTTP isteği atar.
 * - 3 deneme hakkı
 * - Her denemede 10 saniyelik timeout
 * - 429 (rate limit) yanıtında otomatik bekleme
 * - Başarılı yanıtlar kaynak bazlı TTL ile önbelleğe alınır (tüm kaynaklar)
 * - Sürekli hata veren host için devre kesici devreye girer
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  ttlSeconds = resolveTtl(url)
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" || options.body) {
    return fetchRaw(url, options, maxRetries);
  }

  const cacheKey = `http:${url}`;

  // Aynı URL için eşzamanlı istekleri tekilleştirir, TTL boyunca önbellekten döner.
  // Gövde metin olarak saklanır ve her çağrıda YENİ bir Response üretilir:
  // aksi halde ikinci çağıran "Body has already been read" hatası alırdı.
  const hit = await cached(cacheKey, ttlSeconds, async (): Promise<CachedBody> => {
    const response = await fetchRaw(url, options, maxRetries);
    return {
      status: response.status,
      statusText: response.statusText,
      body: await response.text(),
      contentType: response.headers.get("content-type") ?? "text/plain; charset=utf-8",
    };
  });

  // Hata yanıtları (4xx/5xx/rate limit) kalıcı olmamalı: kaynak toparlanınca
  // bir sonraki çağrı veriyi taze denemeli.
  if (hit.status >= 400) cacheDelete(cacheKey);

  return new Response(hit.body, {
    status: hit.status,
    statusText: hit.statusText,
    headers: { "content-type": hit.contentType },
  });
}

async function fetchRaw(url: string, options: RequestInit, maxRetries: number): Promise<Response> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }

  assertBreakerClosed(host);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 429 Rate limit → bekle ve tekrar dene
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const rawWaitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : attempt * 1500;
        const waitMs = Number.isFinite(rawWaitMs) ? Math.min(rawWaitMs, 5000) : 5000;
        await sleep(waitMs);
        continue;
      }

      if (response.status >= 500) recordFailure(host);
      else recordSuccess(host);

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      recordFailure(host);

      if (attempt < maxRetries) {
        await sleep(attempt * 1000); // 1s, 2s, 3s
      }
    }
  }

  throw lastError ?? new Error("Bilinmeyen ağ hatası");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
