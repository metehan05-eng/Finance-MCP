import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchOptions } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface OptionContract {
  contractSymbol: string | null;
  strike: number | null;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatilityPct: number | null;
  inTheMoney: boolean | null;
}

export interface ChainSummary {
  contractCount: number;
  totalOpenInterest: number;
  totalVolume: number;
  itmCount: number;
  atm: OptionContract | null;
  topByOpenInterest: OptionContract[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

/** Yahoo opsiyon kontratını normalize eder (IV kesir → yüzde). */
export function normalizeContract(c: any): OptionContract {
  return {
    contractSymbol: str(c?.contractSymbol),
    strike: num(c?.strike),
    lastPrice: num(c?.lastPrice),
    bid: num(c?.bid),
    ask: num(c?.ask),
    volume: num(c?.volume),
    openInterest: num(c?.openInterest),
    impliedVolatilityPct:
      num(c?.impliedVolatility) === null ? null : (num(c?.impliedVolatility) as number) * 100,
    inTheMoney: typeof c?.inTheMoney === "boolean" ? c.inTheMoney : null,
  };
}

/** Fiyata en yakın kullanım fiyatlı (ATM) kontratı bulur. */
export function nearestStrike(
  contracts: OptionContract[],
  price: number | null
): OptionContract | null {
  if (price === null || contracts.length === 0) return null;
  let best: OptionContract | null = null;
  let bestDiff = Infinity;
  for (const c of contracts) {
    if (c.strike === null) continue;
    const diff = Math.abs(c.strike - price);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

/** Bir calls/puts dizisini özetler. */
export function summarizeChain(rawContracts: any, price: number | null, limit = 10): ChainSummary {
  const contracts = Array.isArray(rawContracts) ? rawContracts.map(normalizeContract) : [];

  const totalOpenInterest = contracts.reduce((s, c) => s + (c.openInterest ?? 0), 0);
  const totalVolume = contracts.reduce((s, c) => s + (c.volume ?? 0), 0);
  const itmCount = contracts.filter((c) => c.inTheMoney === true).length;
  const topByOpenInterest = [...contracts]
    .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
    .slice(0, limit);

  return {
    contractCount: contracts.length,
    totalOpenInterest,
    totalVolume,
    itmCount,
    atm: nearestStrike(contracts, price),
    topByOpenInterest,
  };
}

/** Zincirin vade tarihini YYYY-MM-DD olarak döndürür. */
export function chainDate(chain: any): string | null {
  const v = chain?.expirationDate;
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** İstenen vadeyi (veya ilk vadeyi) seçer; bulunamazsa null. */
export function pickChain(chains: any[], requested?: string): any | null {
  if (!Array.isArray(chains) || chains.length === 0) return null;
  if (!requested) return chains[0];
  return chains.find((c) => chainDate(c) === requested) ?? null;
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface OptionsDeps {
  resolveTickers: typeof resolveTickers;
  fetchOptions: typeof fetchOptions;
}

export const DEFAULT_OPTIONS_DEPS: OptionsDeps = { resolveTickers, fetchOptions };

/**
 * Bir hissenin opsiyon zincirini özetler (ATM kontrat, açık pozisyon, hacim,
 * put/call oranı). Ağırlıklı olarak ABD opsiyon piyasası desteklenir.
 */
export function registerGetOptionsChain(
  server: McpServer,
  deps: OptionsDeps = DEFAULT_OPTIONS_DEPS
) {
  server.tool(
    "get_options_chain",
    "Bir hissenin opsiyon zincirini özetler: mevcut vadeler, ATM call/put, toplam açık pozisyon ve hacim, put/call oranı, en likit kontratlar. Örn: AAPL, NVDA, TSLA (ağırlıklı ABD piyasası).",
    {
      symbol: z.string().min(1).describe("Sembol (AAPL, NVDA, TSLA)"),
      expiration: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Vade tarihi YYYY-MM-DD (verilmezse en yakın vade)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Vade başına gösterilecek en likit kontrat sayısı (1-50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, expiration, limit }) => {
      const upper = symbol.trim().toUpperCase();

      try {
        const resolved = (await deps.resolveTickers([upper])).get(upper) ?? upper;
        const result = await deps.fetchOptions(resolved, expiration);

        const chains: any[] = Array.isArray(result?.options) ? result.options : [];
        if (chains.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: resolved,
                    message:
                      "Bu sembol için opsiyon zinciri bulunamadı. Opsiyon verisi ağırlıklı olarak ABD hisseleri için mevcuttur.",
                    source: "Yahoo Finance (options)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const chain = pickChain(chains, expiration);
        if (!chain) {
          return errorResponse(
            `'${expiration}' vadesi bulunamadı. Mevcut vadeler: ${chains
              .slice(0, 12)
              .map(chainDate)
              .filter(Boolean)
              .join(", ")}`
          );
        }

        const price = num(result?.quote?.regularMarketPrice);
        const calls = summarizeChain(chain?.calls, price, limit);
        const puts = summarizeChain(chain?.puts, price, limit);

        const putCallOi =
          calls.totalOpenInterest > 0 ? puts.totalOpenInterest / calls.totalOpenInterest : null;
        const putCallVol = calls.totalVolume > 0 ? puts.totalVolume / calls.totalVolume : null;

        const simplify = (c: OptionContract) => ({
          contractSymbol: c.contractSymbol,
          strike: round(c.strike),
          lastPrice: round(c.lastPrice),
          bid: round(c.bid),
          ask: round(c.ask),
          volume: c.volume,
          openInterest: c.openInterest,
          impliedVolatilityPct: round(c.impliedVolatilityPct),
          inTheMoney: c.inTheMoney,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: resolved,
                  underlyingPrice: round(price),
                  currency: result?.quote?.currency ?? null,
                  expirationDate: chainDate(chain),
                  availableExpirations: chains
                    .slice(0, 12)
                    .map(chainDate)
                    .filter((d): d is string => d !== null),
                  expirationCount: chains.length,
                  calls: {
                    contractCount: calls.contractCount,
                    totalOpenInterest: calls.totalOpenInterest,
                    totalVolume: calls.totalVolume,
                    itmCount: calls.itmCount,
                    atm: calls.atm ? simplify(calls.atm) : null,
                    topByOpenInterest: calls.topByOpenInterest.map(simplify),
                  },
                  puts: {
                    contractCount: puts.contractCount,
                    totalOpenInterest: puts.totalOpenInterest,
                    totalVolume: puts.totalVolume,
                    itmCount: puts.itmCount,
                    atm: puts.atm ? simplify(puts.atm) : null,
                    topByOpenInterest: puts.topByOpenInterest.map(simplify),
                  },
                  ratios: {
                    putCallOpenInterest: round(putCallOi),
                    putCallVolume: round(putCallVol),
                  },
                  source: "Yahoo Finance (options)",
                  dataNote:
                    "Opsiyon fiyatları ve IV gecikmeli olabilir; likidite düşük kontratlarda spread geniştir. Put/call oranı >1 ise görece kötümser eğilim yorumlanabilir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Opsiyon zinciri alınamadı (${upper}): ${msg}`);
      }
    }
  );
}
