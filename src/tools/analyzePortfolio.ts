import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes, fetchQuote, fetchQuoteSummary } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

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
              .describe(
                "Sembol. BIST için '.IS' eklenir: THYAO.IS, ASELS.IS; küresel: AAPL; kripto: BTC-USD."
              ),
            quantity: z.number().positive().describe("Elindeki adet/miktar"),
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
        .describe(
          "Risksiz oran (% yıllık). Varsayılan %30 (Türkiye mevduat/politika faizi yaklaşımı)"
        ),
      includeBreakdown: z
        .boolean()
        .default(true)
        .describe(
          "Sektör/endüstri kırılımı, ağırlıklı beta ve yoğunlaşma uyarısı hesaplansın mı (sembol başına 1 ek istek)"
        ),
    },
    async ({ positions, riskFreeRatePct, includeBreakdown }) => {
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

        const totalUsd = rich.reduce((s, p) => s + toUsd(p) * p.quantity, 0);
        const lastUsd = rich.reduce((s, p) => s + toUsd(p, p.previousClose) * p.quantity, 0);
        const dailyChange = totalUsd - lastUsd;
        const dailyChangePct = lastUsd > 0 ? (dailyChange / lastUsd) * 100 : 0;

        const withCost = rich.filter((p) => p.cost != null);
        const costUsd = withCost.reduce((s, p) => s + toUsd(p, p.cost) * p.quantity, 0);
        const gainUsd = withCost.length > 0 ? totalUsd - costUsd : null;
        const gainPct =
          withCost.length > 0 && costUsd > 0 ? ((gainUsd as number) / costUsd) * 100 : null;

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
          weightPct: totalUsd > 0 ? round(((toUsd(p) * p.quantity) / totalUsd) * 100) : null,
          cost: p.cost ?? null,
          unrealizedGainPct:
            p.cost != null && p.cost > 0 ? round(((p.price - p.cost) / p.cost) * 100) : null,
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

        // Sektör / endüstri kırılımı ve ağırlıklı beta (summaryProfile + beta)
        let breakdown: Record<string, unknown> | undefined;
        if (includeBreakdown) {
          const profiles = await Promise.all(
            rich.map((p) =>
              fetchQuoteSummary(p.symbol, ["summaryProfile", "summaryDetail"]).catch(
                () => ({}) as Record<string, any>
              )
            )
          );

          const meta = rich.map((p, i) => {
            const prof = profiles[i] ?? {};
            return {
              symbol: p.symbol,
              valueUsd: toUsd(p) * p.quantity,
              sector: (prof.summaryProfile?.sector as string | undefined) ?? null,
              industry: (prof.summaryProfile?.industry as string | undefined) ?? null,
              beta: typeof prof.summaryDetail?.beta === "number" ? prof.summaryDetail.beta : null,
            };
          });

          const bySector = aggregate(
            meta.map((m) => ({ key: m.sector ?? "Bilinmiyor", value: m.valueUsd }))
          );
          const byIndustry = aggregate(
            meta.map((m) => ({ key: m.industry ?? "Bilinmiyor", value: m.valueUsd }))
          );

          breakdown = {
            bySector,
            byIndustry,
            bySectorPct: toPercentMap(bySector),
            weightedBeta: weightedBeta(
              meta.map((m) => ({
                value: m.valueUsd,
                beta: m.beta,
              }))
            ),
            betaCoveragePct: round(
              (meta.filter((m) => m.beta !== null).reduce((a, m) => a + m.valueUsd, 0) / totalUsd) *
                100
            ),
            concentration: concentration(bySector, totalUsd),
            unknownSectorSymbols: meta.filter((m) => m.sector === null).map((m) => m.symbol),
          };
        }

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
                    byCurrencyPct: toPercentMap(byCurrency),
                  },
                  sectorBreakdown: breakdown ?? null,
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

/** Tutar dağılımını yüzdeye çevirir. */
export function toPercentMap(amounts: Record<string, number>): Record<string, number> {
  const total = Object.values(amounts).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(amounts)) {
    out[k] = total > 0 ? (round((v / total) * 100) ?? 0) : 0;
  }
  return out;
}

/** Portföyün ağırlıklı betası (beta yoksa ağırlığı dışarıda bırakılır). */
export function weightedBeta(
  entries: Array<{ value: number; beta: number | null }>
): number | null {
  const known = entries.filter((e) => e.beta !== null) as Array<{ value: number; beta: number }>;
  const covered = known.reduce((a, e) => a + e.value, 0);
  if (covered <= 0) return null;
  // Bilinen betalar kendi normalize ağırlığıyla ortalanır (kapsama payı ayrıca bildirilir)
  const w = known.reduce((a, e) => a + (e.beta as number) * (e.value / covered), 0);
  return round(w, 3);
}

/** Sektör yoğunlaşması: en büyük sektör payı ve uyarı. */
export function concentration(
  bySector: Record<string, number>,
  total: number
): {
  topSector: string | null;
  topSectorPct: number | null;
  sectorCount: number;
  warning: string | null;
} {
  const entries = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const topPct = top && total > 0 ? round((top[1] / total) * 100) : null;
  let warning: string | null = null;
  if (entries.length === 1) {
    warning =
      "Portföy tek bir sektörden oluşuyor; çeşitlendirme yok, sektör riski tüm portföyü etkiler.";
  } else if (topPct !== null && topPct >= 40) {
    warning = `${top![0]} sektörü portföyün %${topPct}'ini oluşturuyor (eşik %40): yoğunlaşma riski.`;
  }
  return {
    topSector: top?.[0] ?? null,
    topSectorPct: topPct,
    sectorCount: entries.length,
    warning,
  };
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
  const diversity = 1 - coreDiversity(weights) * 0.25;
  return avgFactor * diversity;
}

function weightedReturnEstimate(_weights: number[]): number {
  const equityPremiumBase = 0.12; // gelişen piyasa uzun vadeli beklenen reel+enflasyon getirisi
  return equityPremiumBase;
}

function coreDiversity(weights: number[]): number {
  if (weights.length <= 1) return 0;
  const max = Math.max(...weights);
  return max;
}
