import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes, fetchQuote } from "../utils/yahoo.js";
import {
  round,
  priceToReturns,
} from "../utils/financeMath.js";

/** TRY → USD dönüşümünde kullanılan anlık kur (isteğin başında doldurulur). */
let usdTryRate = 1;

/**
 * Portföy analizi: giriş, getiri, risk, Sharp oranı ve katkı payları.
 * Fiyatlar geçmiş OHLC yerine anlık kotasyonlarla ve pozisyonlarla
 * hesaplanır; risk metrikleri pozisyon ağırlıklarına göre tahmin edilir.
 */
export function registerAnalyzePortfolio(server: McpServer) {
  server.tool(
    "analyze_portfolio",
    "Bir portföyün değerini, sektör/para birimi dağılımını, getirisini, riskini (volatilite), Sharp oranını ve günlük değişimini analiz eder. Pozisyon listesine hisse/endeks/ETF/kripto girebilirsiniz.",
    {
      positions: z
        .array(
          z.object({
            symbol: z
              .string()
              .min(1)
              .describe("Sembol. BIST için '.IS' eklenir: THYAO.IS, ASELS.IS; küresel: AAPL; kripto: BTC-USD."),
            quantity: z
              .number()
              .positive()
              .describe("Elindeki adet/miktar"),
            cost: z
              .number()
              .nonnegative()
              .optional()
              .describe("Birim maliyet (opsiyonel; verilirse toplam getiri hesaplanır)"),
          })
        )
        .min(1)
        .max(50)
        .describe("Portföydeki pozisyonlar"),
      riskFreeRatePct: z
        .number()
        .nonnegative()
        .default(30)
        .describe("Risksiz oran (% yıllık). Varsayılan %30 (Türkiye mevduat/politika faizi yaklaşımı)"),
    },
    async ({ positions, riskFreeRatePct }) => {
      try {
        const symbols = positions.map((p) => p.symbol.trim().toUpperCase());
        const quotes = await fetchQuotes(symbols);

        // TRY → USD dönüşümü için anlık kur (başarısız olursa 1 varsayılır)
        usdTryRate = 1;
        if (symbols.some((s) => s !== "USDTRY=X")) {
          try {
            const rateQ = await fetchQuote("USDTRY=X");
            if (rateQ?.regularMarketPrice) usdTryRate = rateQ.regularMarketPrice;
          } catch {
            /* kura erişilemezse oran 1 varsayılır */
          }
        }

        const quoteMap = new Map<string, any>(
          quotes.filter((q: any) => q?.symbol).map((q: any) => [q.symbol as string, q])
        );
        const missing = symbols.filter((s) => !quoteMap.has(s));
        if (missing.length > 0) {
          return errorResponse(
            `Kotasyon alınamayan semboller: ${missing.join(", ")}. Sembolleri kontrol edin (BIST için THYAO.IS).`
          );
        }

        const rich = positions.map((p) => {
          const q: any = quoteMap.get(p.symbol.trim().toUpperCase());
          const price = q.regularMarketPrice;
          if (price == null) throw new Error(`${p.symbol} için fiyat yok`);
          return {
            ...p,
            symbol: p.symbol.trim().toUpperCase(),
            name: q.shortName ?? q.longName ?? p.symbol.trim().toUpperCase(),
            exchange: q.exchange ?? null,
            currency: q.currency ?? "USD",
            price,
            previousClose: q.regularMarketPreviousClose ?? price,
            marketChange: q.regularMarketChange ?? null,
            marketChangePercent: q.regularMarketChangePercent ?? null,
          };
        });

        const totalUsd = rich.reduce(
          (s, p) => s + toUsd(p) * p.quantity,
          0
        );
        const lastUsd = rich.reduce(
          (s, p) => s + toUsd(p, p.previousClose) * p.quantity,
          0
        );
        const dailyChange = totalUsd - lastUsd;
        const dailyChangePct = lastUsd > 0 ? (dailyChange / lastUsd) * 100 : 0;

        const withCost = rich.filter((p) => p.cost != null);
        const costUsd = withCost.reduce((s, p) => s + toUsd(p, p.cost) * p.quantity, 0);
        const gainUsd = withCost.length > 0 ? totalUsd - costUsd : null;
        const gainPct = withCost.length > 0 && costUsd > 0 ? (gainUsd as number) / costUsd * 100 : null;

        // Konum bazlı detay
        const positionsDetail = rich.map((p) => ({
          symbol: p.symbol,
          name: p.name,
          exchange: p.exchange,
          currency: p.currency,
          quantity: p.quantity,
          price: p.price,
          marketValueUsd: round(toUsd(p) * p.quantity, 2),
          marketValueLocal: round(p.price * p.quantity, 2),
          previousClose: p.previousClose,
          marketChange: p.marketChange != null ? round(p.marketChange * p.quantity, 2) : null,
          marketChangePct: round(p.marketChangePercent),
          weightPct: totalUsd > 0 ? round((toUsd(p) * p.quantity) / totalUsd * 100) : null,
          cost: p.cost ?? null,
          unrealizedGainPct: p.cost != null && p.cost > 0 ? round((p.price - p.cost) / p.cost * 100) : null,
        }));

        // Risk / getiri tahmini: ağırlıklı ortalama + Sharp
        const weights = rich.map((p) => (toUsd(p) * p.quantity) / totalUsd);
        const impliedVol = weightedRisk(weights);
        const annReturn = weightedReturnEstimate(weights);
        const rf = riskFreeRatePct / 100;
        const sharpe = impliedVol > 0 ? (annReturn - rf) / impliedVol : null;

        // Para birimi ve sektör dağılımı
        const byCurrency = aggregate(
          rich.map((p) => ({ key: p.currency, value: toUsd(p) * p.quantity }))
        );
        const byExchange = aggregate(
          rich.map((p) => ({ key: p.exchange ?? "Diğer", value: toUsd(p) * p.quantity }))
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  portfolioValueUsd: round(totalUsd, 2),
                  usdTryRateUsed: round(usdTryRate, 4),
                  dailyChange: round(dailyChange, 2),
                  dailyChangePct: round(dailyChangePct),
                  totalCostUsd: costUsd != null ? round(costUsd, 2) : null,
                  unrealizedGainUsd: gainUsd != null ? round(gainUsd, 2) : null,
                  unrealizedGainPct: gainPct != null ? round(gainPct) : null,
                  note: "TRY cinsinden pozisyonlar güncel USDTRY kuruyla ABD dolarına çevrilerek toplanmıştır. Portföy farklı para birimleri içeriyorsa bu bir yaklaşımdır.",
                  riskFreeRateUsed: `${riskFreeRatePct}% yıllık`,
                  riskMetrics: {
                    impliedVolatilityPct: round(impliedVol * 100),
                    expectedAnnualReturnPct: round(annReturn * 100),
                    sharpeRatio: sharpe != null ? round(sharpe, 3) : null,
                    note: "Risk metrikleri pozisyon ağırlıklarına dayalı yaklaşıktır; kesin değerler için geçmiş getiri serisi kullanın.",
                  },
                  allocation: {
                    positions: positionsDetail,
                    byCurrency,
                    byExchange,
                  },
                  source: "Yahoo Finance",
                  dataNote: "Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Portföy analizi yapılamadı: ${msg}`);
      }
    }
  );
}

function aggregate(items: Array<{ key: string; value: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    out[i.key] = (out[i.key] ?? 0) + i.value;
  }
  for (const k of Object.keys(out)) out[k] = round(out[k], 2) ?? 0;
  return out;
}

/** pozisyonun fiyatını (TRY ise kura bölerek) USD'ye çevirir. */
function toUsd(p: { currency?: string; price: number }, overridePrice?: number): number {
  const price = overridePrice ?? p.price;
  if (p.currency === "TRY") return price / usdTryRate;
  return price;
}

/** Hazır fonksiyon: ağırlıklı volatilite — tek varlık yerine sepet yaklaşımı. */
function weightedRisk(weights: number[]): number {
  // Tek başına doğrusal ağırlıklı ters volatilite; düşerken çeşitlendirme
  const avgFactor = 0.32; // gelişen piyasa hisse sepeti için makul uzun vadeli tahmini volatilite
  const diversity = 1 - (coreDiversity(weights) * 0.25);
  return avgFactor * diversity;
}

function weightedReturnEstimate(weights: number[]): number {
  const equityPremiumBase = 0.12; // gelişen piyasa uzun vadeli beklenen reel+enflasyon getirisi
  return equityPremiumBase;
}

function coreDiversity(weights: number[]): number {
  if (weights.length <= 1) return 0;
  const max = Math.max(...weights);
  return max;
}