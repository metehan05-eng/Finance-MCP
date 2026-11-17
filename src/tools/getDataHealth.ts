import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { getYahoo } from "../utils/yahoo.js";
import { cacheStats } from "../utils/cache.js";
import { breakerSnapshot, breakerStatus } from "../utils/httpCircuit.js";
import { round } from "../utils/financeMath.js";

interface Probe {
  name: string;
  category: string;
  keyRequired: boolean;
  run: () => Promise<unknown>;
}

const TIMEOUT_MS = 12_000;

async function timed(
  run: () => Promise<unknown>
): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout (${TIMEOUT_MS}ms)`)), TIMEOUT_MS);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - started, error: msg.slice(0, 140) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function jsonBody(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json"))
    throw new Error(`JSON olmayan yanıt (${contentType || "content-type yok"})`);
  return response.json();
}

/**
 * Tüm veri kaynaklarının anlık erişilebilirliğini ve gecikmesini raporlar.
 * Bir aracın boş dönmesi "veri yok" mu yoksa "kaynak erişilemiyor" mu
 * ayırt etmek için kullanışlıdır.
 */
export function registerGetDataHealth(server: McpServer) {
  server.tool(
    "get_data_health",
    "Tüm veri kaynaklarının (Yahoo Finance, TCMB, CoinGecko, TEFAS, Frankfurter, ForexFactory, Dünya Bankası, alternative.me vb.) anlık erişilebilirliğini, yanıt süresini ve önbellek durumunu raporlar. Hangi kaynağın çalışıp çalışmadığını teşhis etmek için kullanılır.",
    {
      only: z
        .array(z.string())
        .optional()
        .describe("Yalnızca belirli kaynakları test et (örn. ['yahoo_finance','tcmb'])"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ only }) => {
      try {
        const probes: Probe[] = [
          {
            name: "yahoo_finance",
            category: "piyasa",
            keyRequired: false,
            run: async () => {
              const yf = await getYahoo();
              const result = await yf.quote("XU100.IS");
              const quote = Array.isArray(result) ? result[0] : result;
              if (!quote || !Number.isFinite(Number(quote.regularMarketPrice))) {
                throw new Error("Kotasyon yanıtında geçerli fiyat yok");
              }
            },
          },
          {
            name: "tcmb",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/temel+faaliyetler/para+politikasi/merkez+bankasi+faiz+oranlari/1+hafta+repo",
                {
                  headers: { "User-Agent": "Mozilla/5.0" },
                }
              );
              const body = await r.text();
              if (!/<table/i.test(body) || !/\d{2}\.\d{2}\.\d{4}/.test(body)) {
                throw new Error("Faiz tablosu yanıt içinde bulunamadı");
              }
            },
          },
          {
            name: "coingecko",
            category: "kripto",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch("https://api.coingecko.com/api/v3/ping", {
                headers: { Accept: "application/json" },
              });
              const body = await jsonBody(r);
              if (typeof body?.gecko_says !== "string")
                throw new Error("Ping yanıt biçimi geçersiz");
            },
          },
          {
            name: "frankfurter_ecb",
            category: "döviz",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://api.frankfurter.dev/v1/latest?from=USD&to=TRY",
                {
                  headers: { Accept: "application/json" },
                }
              );
              const body = await jsonBody(r);
              if (!Number.isFinite(Number(body?.rates?.TRY)))
                throw new Error("USD/TRY kuru yanıt içinde yok");
            },
          },
          {
            name: "world_bank",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://api.worldbank.org/v2/country/TUR/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1",
                { headers: { Accept: "application/json" } }
              );
              const body = await jsonBody(r);
              if (!Array.isArray(body) || !Array.isArray(body[1]))
                throw new Error("Dünya Bankası yanıt biçimi geçersiz");
            },
          },
          {
            name: "tefas",
            category: "fon",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0",
                    Origin: "https://www.tefas.gov.tr",
                    Referer: "https://www.tefas.gov.tr/",
                  },
                  body: "fontip=YAT&bastarih=20240101&bittarih=20240110&fonkod=",
                }
              );
              const text = await r.text();
              try {
                const body = JSON.parse(text);
                if (!Array.isArray(body) && (body === null || typeof body !== "object")) {
                  throw new Error("TEFAS yanıt biçimi geçersiz");
                }
              } catch (err) {
                throw new Error(
                  `TEFAS JSON doğrulaması başarısız: ${err instanceof Error ? err.message : String(err)}`
                );
              }
            },
          },
          {
            name: "oyak_viop",
            category: "vadeli",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch("https://www.oyakyatirim.com.tr/viop", {
                headers: { "User-Agent": "Mozilla/5.0" },
              });
              const body = await r.text();
              if (!/<tr\b/i.test(body) || !/F_\w+/i.test(body))
                throw new Error("VİOP kontrat satırları bulunamadı");
            },
          },
          {
            name: "forexfactory",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
                {
                  headers: { Accept: "application/json" },
                }
              );
              const body = await jsonBody(r);
              if (!Array.isArray(body) || (body.length > 0 && typeof body[0] !== "object")) {
                throw new Error("Takvim yanıt biçimi geçersiz");
              }
            },
          },
          {
            name: "yahoo_rss_news",
            category: "haber",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch(
                "https://feeds.finance.yahoo.com/rss/2.0/headline?s=XU100.IS&region=TR&lang=tr-TR",
                { headers: { Accept: "application/rss+xml, application/xml, text/xml" } }
              );
              const body = await r.text();
              if (!/<(?:rss|feed)(?:\s|>)/i.test(body) || !/<item\b/i.test(body)) {
                throw new Error("Haber akışında RSS öğesi yok");
              }
            },
          },
          {
            name: "alternative_me",
            category: "kripto",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch("https://api.alternative.me/fng/?limit=1&format=json", {
                headers: { Accept: "application/json" },
              });
              const body = await jsonBody(r);
              if (!Array.isArray(body?.data) || !Number.isFinite(Number(body.data[0]?.value))) {
                throw new Error("Endeks yanıtında geçerli değer yok");
              }
            },
          },
          {
            name: "doviz_com",
            category: "tahvil",
            keyRequired: false,
            run: async () => {
              const r = await checkedFetch("https://www.doviz.com/tahvil/tr-10-yillik-tahvil", {
                headers: { "User-Agent": "Mozilla/5.0" },
              });
              const body = await r.text();
              if (!/data-socket-key="TAHVIL10Y"/.test(body)) {
                throw new Error("10 yıllık tahvil verisi yanıtta bulunamadı");
              }
            },
          },
        ];

        const selected = only?.length
          ? probes.filter((p) => only.some((o) => p.name.toLowerCase().includes(o.toLowerCase())))
          : probes;

        if (selected.length === 0) {
          return errorResponse(
            `Eşleşen kaynak yok. Kullanılabilir: ${probes.map((p) => p.name).join(", ")}`
          );
        }

        const results = await Promise.all(
          selected.map(async (p) => {
            const res = await timed(p.run);
            return {
              source: p.name,
              category: p.category,
              apiKeyRequired: p.keyRequired,
              status: res.ok ? "up" : "down",
              latencyMs: round(res.ms),
              error: res.error ?? null,
            };
          })
        );

        const up = results.filter((r) => r.status === "up").length;
        const latencies = results
          .filter((r) => r.status === "up")
          .map((r) => r.latencyMs as number);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  checkedAt: new Date().toISOString(),
                  summary: {
                    total: results.length,
                    up,
                    down: results.length - up,
                    medianLatencyMs: latencies.length
                      ? round(latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)])
                      : null,
                    allUp: up === results.length,
                  },
                  cache: cacheStats(),
                  circuitBreakers: {
                    open: breakerSnapshot().map(({ host, status }) => ({
                      host,
                      failures: status.failures,
                      openedAt: status.openedAt ? new Date(status.openedAt).toISOString() : null,
                      retryInMs: breakerStatus(host).retryInMs,
                    })),
                    note: "Açık devreler şu anda istek kabul edilmiyor; araçlar anında bilgilendirici hata döner.",
                  },
                  sources: results,
                  dataNote:
                    "Durum anlıktır; ağ koşullarına göre değişir. Yahoo sık zaman aşımına düşebilir; araçlar bunu önbellek, tekrar deneme ve devre kesici ile telafi eder.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Sağlık kontrolü yapılamadı: ${msg}`);
      }
    }
  );
}
