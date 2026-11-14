import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { tryBoth } from "../utils/yahoo.js";
import {
  annualizedReturn,
  annualizedVolatility,
  downsideDeviation,
  kurtosis,
  maxDrawdown,
  mean,
  percentile,
  priceToReturns,
  round,
  skewness,
} from "../utils/financeMath.js";

export interface RiskInput {
  dates: string[];
  closes: number[];
  periodsPerYear: number;
  /** Yıllık risksiz getiri (yüzde, örn. 5). */
  riskFreeRate: number;
  /** Güven düzeyi (yüzde, örn. 95). */
  confidence: number;
}

export interface RiskMetrics {
  observations: number;
  startDate: string | null;
  endDate: string | null;
  totalReturnPct: number;
  cagrPct: number;
  annualVolatilityPct: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  maxDrawdown: {
    pct: number;
    peakDate: string | null;
    troughDate: string | null;
    recoveryDate: string | null;
  };
  valueAtRisk: {
    confidence: number;
    perPeriodLossPct: number;
    cvarLossPct: number;
  };
  bestPeriodPct: number;
  worstPeriodPct: number;
  positivePeriodsPct: number;
  skewness: number;
  excessKurtosis: number;
}

/**
 * Fiyat serisinden risk metriklerini hesaplar. Ağ erişimi yoktur; saf matematik.
 * VaR/CVaR tarihsel (historical) yöntemle, getiri periyodu bazında hesaplanır.
 */
export function computeRiskMetrics(input: RiskInput): RiskMetrics {
  const { dates, closes, periodsPerYear, riskFreeRate, confidence } = input;
  const returns = priceToReturns(closes);
  const rf = riskFreeRate / 100;

  const totalReturn = closes.length > 1 ? closes[closes.length - 1] / closes[0] - 1 : 0;
  const years = (closes.length - 1) / periodsPerYear;
  const cagr =
    years > 0 && closes[0] > 0 ? Math.pow(closes[closes.length - 1] / closes[0], 1 / years) - 1 : 0;

  const annVol = annualizedVolatility(returns, periodsPerYear);
  const annReturn = annualizedReturn(returns, periodsPerYear);
  const sharpe = annVol > 0 ? (annReturn - rf) / annVol : null;

  const rfPeriod = rf / periodsPerYear;
  const downside = downsideDeviation(returns, rfPeriod) * Math.sqrt(periodsPerYear);
  const sortino = downside > 0 ? (annReturn - rf) / downside : null;

  const dd = maxDrawdown(closes);
  const calmar = dd.maxDrawdown < 0 ? annReturn / Math.abs(dd.maxDrawdown) : null;

  const tailProb = (100 - confidence) / 100;
  const varThreshold = percentile(returns, tailProb);
  const varLoss = -varThreshold;
  const tail = returns.filter((r) => r <= varThreshold);
  const cvarLoss = tail.length > 0 ? -mean(tail) : varLoss;

  const dateAt = (i: number): string | null => (i >= 0 && i < dates.length ? dates[i] : null);

  return {
    observations: returns.length,
    startDate: dateAt(0),
    endDate: dateAt(dates.length - 1),
    totalReturnPct: totalReturn * 100,
    cagrPct: cagr * 100,
    annualVolatilityPct: annVol * 100,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    maxDrawdown: {
      pct: dd.maxDrawdown * 100,
      peakDate: dateAt(dd.peakIndex),
      troughDate: dateAt(dd.troughIndex),
      recoveryDate: dd.recoveryIndex === null ? null : dateAt(dd.recoveryIndex),
    },
    valueAtRisk: {
      confidence,
      perPeriodLossPct: varLoss * 100,
      cvarLossPct: cvarLoss * 100,
    },
    bestPeriodPct: (returns.length ? Math.max(...returns) : 0) * 100,
    worstPeriodPct: (returns.length ? Math.min(...returns) : 0) * 100,
    positivePeriodsPct: returns.length
      ? (returns.filter((r) => r > 0).length / returns.length) * 100
      : 0,
    skewness: skewness(returns),
    excessKurtosis: kurtosis(returns),
  };
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface RiskDeps {
  tryBoth: typeof tryBoth;
}

export const DEFAULT_RISK_DEPS: RiskDeps = { tryBoth };

/**
 * Tek bir varlık için riske maruz değer (VaR/CVaR), maksimum düşüş, Sharpe,
 * Sortino, Calmar, volatilite ve dağılım istatistiklerini hesaplar.
 */
export function registerGetRiskMetrics(server: McpServer, deps: RiskDeps = DEFAULT_RISK_DEPS) {
  server.tool(
    "get_risk_metrics",
    "Bir varlığın (hisse, endeks, kripto, döviz) risk metriklerini hesaplar: tarihsel VaR/CVaR, maksimum düşüş ve toparlanma, Sharpe, Sortino, Calmar, yıllık volatilite, çarpıklık/basıklık. Örn: THYAO.IS, AAPL, BTC-USD.",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO.IS, AAPL, BTC-USD, XU100.IS)"),
      period: z
        .enum(["3mo", "6mo", "1y", "2y", "5y", "max"])
        .default("1y")
        .describe("Analiz aralığı"),
      interval: z.enum(["1d", "1wk"]).default("1d").describe("Getiri periyodu (günlük/haftalık)"),
      riskFreeRate: z
        .number()
        .min(0)
        .max(100)
        .default(5)
        .describe("Yıllık risksiz getiri oranı (%, Sharpe/Sortino için)"),
      confidence: z
        .number()
        .int()
        .min(80)
        .max(99)
        .default(95)
        .describe("VaR güven düzeyi (örn. 95 → en kötü %5 senaryo)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, period, interval, riskFreeRate, confidence }) => {
      const upper = symbol.trim().toUpperCase();

      try {
        const chart = await deps.tryBoth(upper, period, interval);
        const rows = chart.rows.filter((r) => r.close !== null);

        if (rows.length < 20) {
          return errorResponse(
            `'${upper}' için yeterli veri yok (${rows.length} gözlem). Daha uzun bir period seçin.`
          );
        }

        const dates = rows.map((r) => r.date.slice(0, 10));
        const closes = rows.map((r) => r.close as number);
        const ppy = interval === "1wk" ? 52 : 252;
        const m = computeRiskMetrics({
          dates,
          closes,
          periodsPerYear: ppy,
          riskFreeRate,
          confidence,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: chart.symbol.replace(/\.IS$/i, ""),
                  currency: chart.currency,
                  period,
                  interval,
                  observations: m.observations,
                  startDate: m.startDate,
                  endDate: m.endDate,
                  returns: {
                    totalReturnPct: round(m.totalReturnPct),
                    cagrPct: round(m.cagrPct),
                    annualVolatilityPct: round(m.annualVolatilityPct),
                    bestPeriodPct: round(m.bestPeriodPct),
                    worstPeriodPct: round(m.worstPeriodPct),
                    positivePeriodsPct: round(m.positivePeriodsPct),
                  },
                  riskAdjusted: {
                    sharpeRatio: round(m.sharpeRatio),
                    sortinoRatio: round(m.sortinoRatio),
                    calmarRatio: round(m.calmarRatio),
                    riskFreeRatePct: riskFreeRate,
                  },
                  drawdown: {
                    maxDrawdownPct: round(m.maxDrawdown.pct),
                    peakDate: m.maxDrawdown.peakDate,
                    troughDate: m.maxDrawdown.troughDate,
                    recoveryDate: m.maxDrawdown.recoveryDate,
                  },
                  valueAtRisk: {
                    confidencePct: m.valueAtRisk.confidence,
                    perPeriodLossPct: round(m.valueAtRisk.perPeriodLossPct),
                    cvarLossPct: round(m.valueAtRisk.cvarLossPct),
                    note: `VaR/CVaR ${interval === "1wk" ? "haftalık" : "günlük"} getiri bazındadır; tarihsel simülasyondur ve gelecek garantisi değildir.`,
                  },
                  distribution: {
                    skewness: round(m.skewness),
                    excessKurtosis: round(m.excessKurtosis),
                  },
                  source: "Yahoo Finance OHLC + yerel hesaplama",
                  dataNote:
                    "Geçmiş performans gelecek getiriyi garanti etmez. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Risk metrikleri hesaplanamadı (${upper}): ${msg}`);
      }
    }
  );
}
