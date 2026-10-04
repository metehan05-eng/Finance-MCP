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
  try {
    await run();
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - started, error: msg.slice(0, 140) };
  }
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
    async ({ only }) => {
      try {
        const probes: Probe[] = [
          {
            name: "yahoo_finance",
            category: "piyasa",
            keyRequired: false,
            run: async () => {
              const yf = await getYahoo();
              await Promise.race([
                yf.quote(["XU100.IS"]),
                new Promise((_, rej) =>
                  setTimeout(() => rej(new Error("timeout (12s)")), TIMEOUT_MS)
                ),
              ]);
            },
          },
          {
            name: "tcmb",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await fetch(
                "https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/temel+faaliyetler/para+politikasi/merkez+bankasi+faiz+oranlari/1+hafta+repo",
                {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  signal: AbortSignal.timeout(TIMEOUT_MS),
                }
              );
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "coingecko",
            category: "kripto",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://api.coingecko.com/api/v3/ping", {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "frankfurter_ecb",
            category: "döviz",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=TRY", {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "world_bank",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await fetch(
                "https://api.worldbank.org/v2/country/TUR/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1",
                { signal: AbortSignal.timeout(TIMEOUT_MS) }
              );
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "tefas",
            category: "fon",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "User-Agent": "Mozilla/5.0",
                  Origin: "https://www.tefas.gov.tr",
                  Referer: "https://www.tefas.gov.tr/",
                },
                body: "fontip=YAT&bastarih=20240101&bittarih=20240110&fonkod=",
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "oyak_viop",
            category: "vadeli",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://www.oyakyatirim.com.tr/viop", {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "forexfactory",
            category: "makro",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const text = await r.text();
              if (!text.trim().startsWith("[")) throw new Error("HTML yanıt (rate limit olabilir)");
            },
          },
          {
            name: "yahoo_rss_news",
            category: "haber",
            keyRequired: false,
            run: async () => {
              const r = await fetch(
                "https://feeds.finance.yahoo.com/rss/2.0/headline?s=XU100.IS&region=TR&lang=tr-TR",
                { signal: AbortSignal.timeout(TIMEOUT_MS) }
              );
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "alternative_me",
            category: "kripto",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://api.alternative.me/fng/?limit=1&format=json", {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            },
          },
          {
            name: "doviz_com",
            category: "tahvil",
            keyRequired: false,
            run: async () => {
              const r = await fetch("https://www.doviz.com/tahvil/tr-10-yillik-tahvil", {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
