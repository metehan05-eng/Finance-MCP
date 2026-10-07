import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes, fetchOhlc } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/** ABD sektör ETF'leri (Yahoo sembolleri) — sektör performans proxy'si. */
export const SECTOR_ETFS = [
  { symbol: "XLK", sector: "Teknoloji" },
  { symbol: "XLF", sector: "Finans" },
  { symbol: "XLE", sector: "Enerji" },
  { symbol: "XLV", sector: "Sağlık" },
  { symbol: "XLI", sector: "Sanayi" },
  { symbol: "XLY", sector: "Gıda/Tüketim" },
  { symbol: "XLP", sector: "Temel Tüketim" },
  { symbol: "XLU", sector: "Altyapı/Utility" },
  { symbol: "XLB", sector: "Malzeme" },
  { symbol: "XLC", sector: "İletişim" },
  { symbol: "XLRE", sector: "Gayrimenkul" },
] as const;

export interface SectorPerf {
  symbol: string;
  sector: string;
  periodReturn: number | null;
  bars: number;
}

/** Veri dizisinden dönem getirisi yüzdesi hesaplar; yetersiz veri null döner. */
export function periodReturn(closes: Array<number | null>): number | null {
  const clean = closes.filter((c) => typeof c === "number" && c > 0);
  if (clean.length < 2) return null;
  const first = clean[0] as number;
  const last = clean[clean.length - 1] as number;
  if (first <= 0) return null;
  return round(((last - first) / first) * 100);
}

/** En yüksek getirili sektörü bulur (en az 1 veri noktası olanlar arasında). */
export function bestSector(rows: SectorPerf[]): SectorPerf | null {
  const valid = rows.filter((r) => r.periodReturn !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) =>
    (b.periodReturn ?? -Infinity) > (a.periodReturn ?? -Infinity) ? b : a
  );
}

/**
 * ABD sektör performansı: 11 sektör ETF'inin dönem getirisi ve sıralaması.
 */
/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface SectorDeps {
  fetchOhlc: typeof fetchOhlc;
  fetchQuotes: typeof fetchQuotes;
}

export const DEFAULT_SECTOR_DEPS: SectorDeps = { fetchOhlc, fetchQuotes };

export function registerGetSectorPerformance(
  server: McpServer,
  deps: SectorDeps = DEFAULT_SECTOR_DEPS
) {
  server.tool(
    "get_sector_performance",
    "ABD piyasasında 11 sektörün performansını karşılaştırır (sektör ETF'leri üzerinden): günlük/haftalık/aylık/3 aylık getiri sıralaması, en güçlü ve en zayıf sektör.",
    {
      period: z
        .enum(["1d", "5d", "1mo", "3mo", "6mo", "1y"])
        .default("1mo")
        .describe("Getiri dönemi"),
      includeGlobal: z
        .boolean()
        .default(true)
        .describe(
          "Ek olarak dünya endeksleri (SPY, QQQ, DIA, EEM, TLT) karşılaştırmaya eklensin mi"
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ period, includeGlobal }) => {
      const rangeMap: Record<string, [string, string]> = {
        "1d": ["5d", "1d"],
        "5d": ["1mo", "1d"],
        "1mo": ["3mo", "1d"],
        "3mo": ["6mo", "1d"],
        "6mo": ["1y", "1wk"],
        "1y": ["2y", "1wk"],
      };
      const [range, interval] = rangeMap[period] as [string, string];

      try {
        const [sectorRows, globalRows] = await Promise.all([
          Promise.all(
            SECTOR_ETFS.map(async (etf) => {
              try {
                const chart = await deps.fetchOhlc(etf.symbol, { period: range, interval });
                const closes = chart.rows.map((r) => r.close as number | null);
                return {
                  symbol: etf.symbol,
                  sector: etf.sector,
                  periodReturn: periodReturn(closes),
                  bars: closes.length,
                } satisfies SectorPerf;
              } catch {
                return {
                  symbol: etf.symbol,
                  sector: etf.sector,
                  periodReturn: null,
                  bars: 0,
                } satisfies SectorPerf;
              }
            })
          ),
          includeGlobal
            ? (async () => {
                const symbols = ["SPY", "QQQ", "DIA", "EEM", "TLT"];
                const quotes = await deps.fetchQuotes(symbols);
                const by = new Map(
                  (quotes as any[]).filter((q) => q?.symbol).map((q) => [q.symbol, q] as const)
                );
                return symbols.map((s) => {
                  const q: any = by.get(s) ?? {};
                  return {
                    symbol: s,
                    name: q.longName ?? q.shortName ?? s,
                    price:
                      typeof q.regularMarketPrice === "number" ? round(q.regularMarketPrice) : null,
                    dayChangePercent:
                      typeof q.regularMarketChangePercent === "number"
                        ? round(q.regularMarketChangePercent)
                        : null,
                  };
                });
              })()
            : Promise.resolve(null),
        ]);

        const usable = sectorRows.filter((r) => r.periodReturn !== null);
        if (usable.length === 0) {
          return errorResponse("Sektör ETF verileri alınamadı, lütfen tekrar deneyin.");
        }

        const ranked = [...usable].sort((a, b) => (b.periodReturn ?? 0) - (a.periodReturn ?? 0));
        const worst = ranked[ranked.length - 1] ?? null;
        const best = bestSector(sectorRows);
        const returns = usable.map((r) => r.periodReturn ?? 0);
        const avg = round(returns.reduce((a, b) => a + b, 0) / returns.length);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                period,
                unit: "% (dönem getirisi)",
                sectors: ranked,
                strongest: best
                  ? { sector: best.sector, symbol: best.symbol, periodReturn: best.periodReturn }
                  : null,
                weakest: worst
                  ? { sector: worst.sector, symbol: worst.symbol, periodReturn: worst.periodReturn }
                  : null,
                averageSectorReturn: avg,
                breadth: {
                  sectorsUp: usable.filter((r) => (r.periodReturn ?? 0) > 0).length,
                  sectorsTotal: usable.length,
                },
                globalBenchmarks: globalRows,
                missing: sectorRows.filter((r) => r.periodReturn === null).map((r) => r.symbol),
                note: "Sektör performansı ABD sektör ETF'leri (XLK, XLF, ...) ile temsilîdir.",
                source: "Yahoo Finance (günlük/haftalık barlar)",
              }),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `Sektör performansı alınamadı: ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      }
    }
  );
}
