import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuoteSummary, fetchQuote } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface ComparisonRow {
  symbol: string;
  name: string | null;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  returnOnEquity: number | null;
  dividendYield: number | null;
  week52High: number | null;
  distanceTo52High: number | null;
  beta: number | null;
}

const pct = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v !== 0 ? round((v as number) * 100) : null;

/** Ham quote + summary modüllerinden karşılaştırma satırı üretir (eksik alanlar null). */
export function buildRow(
  symbol: string,
  quote: Record<string, any> | undefined,
  summary: Record<string, any> | undefined
): ComparisonRow {
  const q = quote ?? {};
  const sd = summary?.summaryDetail ?? {};
  const ks = summary?.defaultKeyStatistics ?? {};
  const fd = summary?.financialData ?? {};

  const price = typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
  const high52 = typeof sd.fiftyTwoWeekHigh === "number" ? sd.fiftyTwoWeekHigh : null;

  // Yahoo bazen marketCap alanını döndürmüyor; fiyat × hisse sayısından hesaplanır.
  const shares =
    (typeof ks.sharesOutstanding === "number" && ks.sharesOutstanding) ||
    (typeof ks.impliedSharesOutstanding === "number" && ks.impliedSharesOutstanding) ||
    null;
  const marketCapRaw =
    typeof ks.marketCap === "number" && ks.marketCap > 0
      ? ks.marketCap
      : price !== null && shares !== null
        ? price * shares
        : null;

  return {
    symbol,
    name: q.longName ?? q.shortName ?? null,
    price: price === null ? null : round(price),
    changePercent:
      typeof q.regularMarketChangePercent === "number" ? round(q.regularMarketChangePercent) : null,
    marketCap: marketCapRaw === null ? null : round(marketCapRaw / 1_000_000_000),
    enterpriseValue:
      typeof ks.enterpriseValue === "number" && ks.enterpriseValue > 0
        ? round(ks.enterpriseValue / 1_000_000_000)
        : null,
    trailingPE: typeof sd.trailingPE === "number" ? round(sd.trailingPE) : null,
    priceToBook: typeof ks.priceToBook === "number" ? round(ks.priceToBook) : null,
    returnOnEquity: typeof fd.returnOnEquity === "number" ? pct(fd.returnOnEquity) : null,
    dividendYield: typeof sd.dividendYield === "number" ? pct(sd.dividendYield) : null,
    week52High: high52 === null ? null : round(high52),
    distanceTo52High:
      price !== null && high52 !== null && high52 > 0
        ? round(((price - high52) / high52) * 100)
        : null,
    beta: typeof sd.beta === "number" ? round(sd.beta) : null,
  };
}

/** Sıralama yardımcısı: null'lar her zaman sona. */
export function sortByKey(
  rows: ComparisonRow[],
  key: keyof ComparisonRow,
  dir: "asc" | "desc"
): ComparisonRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key] as number | null;
    const bv = b[key] as number | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * sign;
  });
}

/**
 * Çoklu hisse karşılaştırma tablosu (fiyat, değerleme, verim, 52 hafta).
 */
/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface CompareDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuoteSummary: typeof fetchQuoteSummary;
  fetchQuote: typeof fetchQuote;
}

export const DEFAULT_COMPARE_DEPS: CompareDeps = { resolveTickers, fetchQuoteSummary, fetchQuote };

export function registerCompareStocks(server: McpServer, deps: CompareDeps = DEFAULT_COMPARE_DEPS) {
  server.tool(
    "compare_stocks",
    "2-8 hisseyi yan yana karşılaştırır: fiyat, günlük değişim, piyasa değeri, F/K, F/DD, ROE, temettü verimi, 52 hafta yükseğe uzaklık ve beta. BIST dahil tüm borsalar.",
    {
      symbols: z
        .array(z.string().min(1))
        .min(2)
        .max(8)
        .describe("Karşılaştırılacak semboller (örn: ['THYAO', 'GARAN', 'AAPL'])"),
      sortBy: z
        .enum([
          "symbol",
          "price",
          "changePercent",
          "marketCap",
          "trailingPE",
          "priceToBook",
          "returnOnEquity",
          "dividendYield",
          "distanceTo52High",
        ])
        .default("marketCap")
        .describe("Sıralama ölçütü"),
      order: z.enum(["asc", "desc"]).default("desc").describe("Sıralama yönü"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbols, sortBy, order }) => {
      const upper = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
      if (upper.length < 2) {
        return errorResponse("En az 2 farklı sembol girin (örn: THYAO, AAPL).");
      }

      // Sembolleri gerçek ticker'a bağla (THYAO → THYAO.IS, USD/TRY → USDTRY=X)
      const resolved = await deps.resolveTickers(upper);

      const targets = upper.map((s) => resolved.get(s) ?? s);
      try {
        const summaries = await Promise.all(
          targets.map((t) =>
            deps
              .fetchQuoteSummary(t, ["summaryDetail", "defaultKeyStatistics", "financialData"])
              .catch(() => ({}) as Record<string, any>)
          )
        );
        const quotesByTarget = await Promise.all(
          targets.map((t) => deps.fetchQuote(t).catch(() => undefined))
        );
        const quoteBySymbol = new Map(
          quotesByTarget.filter((q) => q?.symbol).map((q) => [q.symbol.toUpperCase(), q] as const)
        );

        const rows = upper.map((input, i) =>
          buildRow(
            targets[i] as string,
            quoteBySymbol.get((targets[i] as string).toUpperCase()),
            summaries[i]
          )
        );

        const priced = rows.filter((r) => r.price !== null);
        if (priced.length === 0) {
          return errorResponse(
            `Hiçbir sembol için fiyat alınamadı: ${upper.join(", ")}. Sembolleri kontrol edin.`
          );
        }

        const sorted = sortByKey(rows, sortBy, order);
        const missing = rows.filter((r) => r.price === null).map((r) => r.symbol);
        const best = sortByKey(priced, sortBy, order)[0];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: rows.length,
                comparison: sorted,
                leader: best ? { symbol: best.symbol, [sortBy]: best[sortBy] } : null,
                notFound: missing,
                notes: [
                  "marketCap ve enterpriseValue milyar birimindedir",
                  "marketCap yoksa fiyat × hisse sayısından hesaplanır",
                  "returnOnEquity, dividendYield ve distanceTo52High yüzde (%)",
                  "null = veri yok (ör. zarardaki şirkette F/K veya BIST'te eksik alan)",
                ],
                source: "Yahoo Finance (quote + quoteSummary)",
              }),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `Karşılaştırma yapılamadı: ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      }
    }
  );
}
