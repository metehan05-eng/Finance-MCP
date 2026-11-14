import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes, fetchQuote, fetchQuoteSummary, fetchOhlc, tryBoth } from "../utils/yahoo.js";
import { commonDates } from "./backtestPortfolio.js";
import { round, stdev, maxDrawdown } from "../utils/financeMath.js";

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface PortfolioDeps {
  fetchQuotes: typeof fetchQuotes;
  fetchQuote: typeof fetchQuote;
  fetchQuoteSummary: typeof fetchQuoteSummary;
  fetchOhlc: typeof fetchOhlc;
  tryBoth: typeof tryBoth;
}

export const DEFAULT_PORTFOLIO_DEPS: PortfolioDeps = {
  fetchQuotes,
  fetchQuote,
  fetchQuoteSummary,
  fetchOhlc,
  tryBoth,
};

/** Geçmiş serilerden hesaplanan portföy risk metrikleri (tüm oranlar kesir). */
export interface HistoricalRiskMetrics {
  period: "1y";
  interval: "1d";
  dataPoints: number;
  startDate: string;
  endDate: string;
  annualizedVolatility: number;
  annualizedReturn: number;
  sharpeRatio: number | null;
  maxDrawdown: number;
}

export interface HistoricalRiskInput {
  /** Sembol → güncel portföy ağırlığı (toplamı ~1). */
  weights: Map<string, number>;
  /** Sembol → tarih (YYYY-MM-DD) → yerel kapanış. */
  closesBySymbol: Map<string, Map<string, number>>;
  /** TRY cinsinden kapanışları USD'ye çevirmek için USD/TRY serisi. */
  fxUsdTry: Map<string, number> | null;
  /** USD'ye çevrilmesi gereken TRY sembolleri. */
  trySymbols: Set<string>;
  riskFreeRatePct: number;
  periodsPerYear?: number;
  minPoints?: number;
}

/** Bir FX serisinde verilen tarihe en yakın önceki kuru döndürür. */
function rateAt(fx: Map<string, number>, date: string): number | null {
  if (fx.has(date)) return fx.get(date) as number;
  let best: string | null = null;
  for (const key of fx.keys()) {
    if (key <= date && (best === null || key > best)) best = key;
  }
  return best === null ? null : (fx.get(best) as number);
}

/**
 * Güncel ağırlıklarla, USD cinsinden günlük portföy getirilerinden yıllık
 * volatilite/getiri, Sharpe ve maksimum düşüş hesaplar. Sabit varsayım yoktur.
 * Yeterli ortak geçmiş yoksa `null` döner.
 */
export function computeHistoricalRisk(input: HistoricalRiskInput): HistoricalRiskMetrics | null {
  const { weights, closesBySymbol, fxUsdTry, trySymbols, riskFreeRatePct } = input;
  const periods = input.periodsPerYear ?? 252;
  const minPoints = input.minPoints ?? 20;

  const usdCloses = new Map<string, Map<string, number>>();
  for (const [symbol, local] of closesBySymbol) {
    const weight = weights.get(symbol) ?? 0;
    if (weight <= 0) continue;
    const converted = new Map<string, number>();
    for (const [date, close] of local) {
      if (!Number.isFinite(close) || close <= 0) continue;
      if (trySymbols.has(symbol)) {
        if (!fxUsdTry) return null;
        const rate = rateAt(fxUsdTry, date);
        if (rate === null || rate <= 0) continue;
        converted.set(date, close / rate);
      } else {
        converted.set(date, close);
      }
    }
    if (converted.size > 0) usdCloses.set(symbol, converted);
  }

  if (usdCloses.size === 0) return null;

  const dates = commonDates([...usdCloses.values()]).sort();
  if (dates.length < minPoints + 1) return null;

  const symbols = [...usdCloses.keys()];
  const weightSum = symbols.reduce((a, s) => a + (weights.get(s) ?? 0), 0);
  if (weightSum <= 0) return null;
  const normalized = new Map(symbols.map((s) => [s, (weights.get(s) ?? 0) / weightSum]));

  const returns: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    let r = 0;
    for (const s of symbols) {
      const series = usdCloses.get(s) as Map<string, number>;
      const prev = series.get(dates[i - 1]) as number;
      const cur = series.get(dates[i]) as number;
      r += (normalized.get(s) as number) * (cur / prev - 1);
    }
    returns.push(r);
  }

  const values: number[] = [1];
  for (const r of returns) values.push(values[values.length - 1] * (1 + r));
  const finalValue = values[values.length - 1];
  if (!(finalValue > 0)) return null;

  const annualizedVol = stdev(returns) * Math.sqrt(periods);
  const years = returns.length / periods;
  const annualizedReturn = Math.pow(finalValue, 1 / years) - 1;
  const rf = riskFreeRatePct / 100;
  const sharpe = annualizedVol > 0 ? (annualizedReturn - rf) / annualizedVol : null;

  return {
    period: "1y",
    interval: "1d",
    dataPoints: dates.length,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    annualizedVolatility: annualizedVol,
    annualizedReturn,
    sharpeRatio: sharpe,
    maxDrawdown: maxDrawdown(values).maxDrawdown,
  };
}

/**
 * Portföy analizi: giriş, getiri, risk, Sharp oranı ve katkı payları.
 * Fiyatlar geçmiş OHLC yerine anlık kotasyonlarla ve pozisyonlarla
 * hesaplanır; risk metrikleri pozisyon ağırlıklarına göre tahmin edilir.
 */
export function registerAnalyzePortfolio(
  server: McpServer,
  deps: PortfolioDeps = DEFAULT_PORTFOLIO_DEPS
) {
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
    { readOnlyHint: true, openWorldHint: true },
    async ({ positions, riskFreeRatePct, includeBreakdown }) => {
      try {
        const symbols = positions.map((p) => p.symbol.trim().toUpperCase());
        const quotes = await deps.fetchQuotes(symbols);

        // TRY → USD dönüşümü için anlık kur. İstek kapsamında YEREL tutulur; modül
        // düzeyinde global olsaydı eşzamanlı iki analiz birbirinin kurunu ezerdi.
        let usdTryRate = 1;
        let fxUnavailable = false;
        if (symbols.some((s) => s !== "USDTRY=X")) {
          try {
            const rateQ = await deps.fetchQuote("USDTRY=X");
            if (rateQ?.regularMarketPrice) usdTryRate = rateQ.regularMarketPrice;
            else fxUnavailable = true;
          } catch {
            fxUnavailable = true;
          }
        }
        const toUsd = (p: { currency?: string; price: number }, overridePrice?: number): number => {
          const price = overridePrice ?? p.price;
          return p.currency === "TRY" ? price / usdTryRate : price;
        };

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

        // Kur alınamadıysa TRY pozisyonlu toplamlar ~49 kat şaşabilir; sessizce 1
        // varsaymak yerine hatayı açıkça bildir (TRY olmayan portföyler etkilenmez).
        if (fxUnavailable && rich.some((p) => p.currency === "TRY")) {
          return errorResponse(
            "USD/TRY kuru alınamadı; TRY cinsinden pozisyonlar nedeniyle portföy değeri güvenilir hesaplanamaz. Lütfen tekrar deneyin."
          );
        }

        const totalUsd = rich.reduce((s, p) => s + toUsd(p) * p.quantity, 0);
        const lastUsd = rich.reduce((s, p) => s + toUsd(p, p.previousClose) * p.quantity, 0);
        const dailyChange = totalUsd - lastUsd;
        const dailyChangePct = lastUsd > 0 ? (dailyChange / lastUsd) * 100 : 0;

        const withCost = rich.filter((p) => p.cost != null);
        const costUsd = withCost.reduce((s, p) => s + toUsd(p, p.cost) * p.quantity, 0);
        // Getiri yalnızca maliyeti bilinen pozisyonlar üzerinden ölçülür; aksi halde
        // maliyetsiz pozisyonların tüm güncel değeri hatalı biçimde kâr sayılırdı.
        const costedValueUsd = withCost.reduce((s, p) => s + toUsd(p) * p.quantity, 0);
        const gainUsd = withCost.length > 0 ? costedValueUsd - costUsd : null;
        const gainPct =
          withCost.length > 0 && costUsd > 0 ? ((gainUsd as number) / costUsd) * 100 : null;
        const totalCostUsd = withCost.length > 0 ? costUsd : null;

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

        // Risk / getiri: güncel ağırlıklarla geçmiş günlük USD getirilerinden.
        const weightBySymbol = new Map<string, number>();
        if (totalUsd > 0) {
          for (const p of rich) {
            const w = (toUsd(p) * p.quantity) / totalUsd;
            weightBySymbol.set(p.symbol, (weightBySymbol.get(p.symbol) ?? 0) + w);
          }
        }

        let historicalRisk: HistoricalRiskMetrics | null = null;
        let riskNote = "Güncel portföy değeri sıfır olduğu için risk metrikleri hesaplanamadı.";
        if (totalUsd > 0) {
          try {
            const closesBySymbol = new Map<string, Map<string, number>>();
            for (const symbol of new Set(rich.map((p) => p.symbol))) {
              try {
                const chart = await deps.tryBoth(symbol, "1y", "1d");
                const closes = new Map<string, number>();
                for (const row of chart.rows) {
                  if (typeof row.close === "number") closes.set(row.date.slice(0, 10), row.close);
                }
                if (closes.size >= 21) closesBySymbol.set(symbol, closes);
              } catch {
                // Tek sembolün geçmişi alınamazsa diğerleriyle devam et.
              }
            }

            const trySymbols = new Set(
              rich.filter((p) => p.currency === "TRY").map((p) => p.symbol)
            );
            let fxUsdTry: Map<string, number> | null = null;
            if (trySymbols.size > 0) {
              const fx = await deps.fetchOhlc("USDTRY=X", { period: "1y", interval: "1d" });
              fxUsdTry = new Map(
                fx.rows
                  .filter((r) => typeof r.close === "number")
                  .map((r) => [r.date.slice(0, 10), r.close as number])
              );
            }

            historicalRisk = computeHistoricalRisk({
              weights: weightBySymbol,
              closesBySymbol,
              fxUsdTry,
              trySymbols,
              riskFreeRatePct,
            });
            riskNote = historicalRisk
              ? "Güncel ağırlıklarla son 1 yılın günlük USD getirilerinden hesaplanmıştır; işlem maliyeti ve vergi içermez."
              : "Yeterli ortak geçmiş fiyat verisi bulunamadı; portföy riski hesaplanamadı.";
          } catch (err) {
            riskNote = `Geçmiş fiyat serisi alınamadı: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

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
              deps
                .fetchQuoteSummary(p.symbol, ["summaryProfile", "summaryDetail"])
                .catch(() => ({}) as Record<string, any>)
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
                  totalCostUsd: totalCostUsd != null ? round(totalCostUsd, 2) : null,
                  unrealizedGainUsd: gainUsd != null ? round(gainUsd, 2) : null,
                  unrealizedGainPct: gainPct != null ? round(gainPct) : null,
                  note: "TRY cinsinden pozisyonlar güncel USDTRY kuruyla ABD dolarına çevrilerek toplanmıştır. Portföy farklı para birimleri içeriyorsa bu bir yaklaşımdır.",
                  riskFreeRateUsed: `${riskFreeRatePct}% yıllık`,
                  riskMetrics: historicalRisk
                    ? {
                        method: "historical",
                        period: historicalRisk.period,
                        interval: historicalRisk.interval,
                        dataPoints: historicalRisk.dataPoints,
                        startDate: historicalRisk.startDate,
                        endDate: historicalRisk.endDate,
                        annualizedVolatilityPct: round(historicalRisk.annualizedVolatility * 100),
                        annualizedReturnPct: round(historicalRisk.annualizedReturn * 100),
                        sharpeRatio:
                          historicalRisk.sharpeRatio != null
                            ? round(historicalRisk.sharpeRatio, 3)
                            : null,
                        maxDrawdownPct: round(historicalRisk.maxDrawdown * 100),
                        note: riskNote,
                      }
                    : null,
                  riskMetricsNote: historicalRisk ? null : riskNote,
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
