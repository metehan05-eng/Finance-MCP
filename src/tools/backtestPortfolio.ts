import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchOhlc, tryBoth } from "../utils/yahoo.js";
import { round, stdev, mean } from "../utils/financeMath.js";

const TRADING_DAYS = 252;

/**
 * Geçmiş portföy performans analizi (backtest).
 * TRY varlıklar USD'ye çevrilerek karşılaştırma yapılır; kur etkisi
 * ayrıca raporlanır.
 */
export function registerBacktestPortfolio(server: McpServer) {
  server.tool(
    "backtest_portfolio",
    "Verilen portföy (sembol + adet) için geçmiş performans analizi yapar: toplam getiri, yıllıklanmış getiri (CAGR), volatilite, maksimum düşüş (drawdown), Sharpe oranı ve varlık bazlı katkılar. TRY varlıklar portföye girmeden önce USD'ye çevrilir; kur etkisi ayrıca gösterilir. Örn: [{symbol:'THYAO.IS',quantity:100},{symbol:'AAPL',quantity:20}]",
    {
      positions: z
        .array(
          z.object({
            symbol: z.string().min(1).describe("Sembol (THYAO.IS, AAPL, BTC-USD)"),
            quantity: z.number().positive().describe("Adet / miktar (pozitif)"),
          })
        )
        .min(1)
        .max(15)
        .describe("Portföy pozisyonları"),
      period: z
        .enum(["3mo", "6mo", "1y", "2y", "5y", "max"])
        .default("1y")
        .describe("Analiz aralığı"),
      interval: z.enum(["1d", "1wk"]).default("1d").describe("Veri periyodu (günlük/haftalık)"),
      riskFreeRate: z
        .number()
        .default(5)
        .describe("Yıllık risksiz getiri oranı (%, Sharpe için, default 5)"),
    },
    async ({ positions, period, interval, riskFreeRate }) => {
      try {
        // 1) Her varlık için kapanış serisi
        const series = new Map<string, Map<string, number>>();
        const failures: string[] = [];
        for (const p of positions) {
          try {
            const chart = await tryBoth(p.symbol.trim().toUpperCase(), period, interval);
            const m = new Map<string, number>();
            for (const row of chart.rows) m.set(row.date.slice(0, 10), row.close as number);
            if (m.size > 0) series.set(p.symbol, m);
            else failures.push(p.symbol);
          } catch {
            failures.push(p.symbol);
          }
        }

        if (series.size === 0) {
          return errorResponse(
            `Hiçbir sembol için veri alınamadı (${positions.map((p) => p.symbol).join(", ")})`
          );
        }

        // 2) Ortak takvim: her seride en az veri olanın kesişimi
        let common: string[] = [];
        for (const m of series.values()) {
          const dates = [...m.keys()];
          common = common.length === 0 ? dates : common.filter((d) => m.has(d));
        }
        common.sort();
        if (common.length < 10) {
          return errorResponse(
            `Yeterli ortak veri yok (${common.length} gün). Sembollerin farklı borsalarda olması sorun olabilir.`
          );
        }

        // 3) Kur serisi (TRY varlıklarını USD'ye çevirmek için)
        let usdTry: Map<string, number> | null = null;
        try {
          const fx = await fetchOhlc("USDTRY=X", { period, interval });
          usdTry = new Map(fx.rows.map((r) => [r.date.slice(0, 10), r.close as number]));
        } catch {
          usdTry = null;
        }

        const hasTry = [...series.keys()].some((s) => s.toUpperCase().endsWith(".IS"));
        const rateAt = (d: string): number | null => {
          if (!usdTry) return null;
          if (usdTry.has(d)) return usdTry.get(d) as number;
          // en yakın önceki güne bak
          const keys = [...usdTry.keys()].filter((k) => k <= d).sort();
          return keys.length > 0 ? (usdTry.get(keys[keys.length - 1]) as number) : null;
        };

        // 4) Her gün portföy değeri (USD) + kur etkisi (TL bazlı, sadece TRY varlıklar)
        const daily: Array<{ date: string; valueUsd: number; valueTry: number }> = [];
        for (const d of common) {
          let usd = 0;
          let tryVal = 0;
          for (const p of positions) {
            const m = series.get(p.symbol);
            if (!m || !m.has(d)) continue;
            const px = m.get(d) as number;
            const isTry = p.symbol.toUpperCase().endsWith(".IS");
            tryVal += px * p.quantity;
            if (isTry && rateAt(d) !== null) usd += (px * p.quantity) / (rateAt(d) as number);
            else usd += px * p.quantity;
          }
          daily.push({ date: d, valueUsd: usd, valueTry: tryVal });
        }

        // 5) Metrikler
        const values = daily.map((d) => d.valueUsd);
        const returns = values.slice(1).map((v, i) => (values[i] === 0 ? 0 : v / values[i] - 1));

        const years = (common.length - 1) / TRADING_DAYS;
        const first = values[0];
        const lastV = values[values.length - 1];
        const totalReturn = first === 0 ? 0 : lastV / first - 1;
        const cagr = years > 0 && first > 0 ? Math.pow(lastV / first, 1 / years) - 1 : null;

        const vol = stdev(returns) * Math.sqrt(TRADING_DAYS);
        const meanRet = mean(returns);
        const rf = riskFreeRate / 100;
        const sharpe =
          stdev(returns) > 0
            ? (meanRet * TRADING_DAYS - rf) / (stdev(returns) * Math.sqrt(TRADING_DAYS))
            : null;

        // Maksimum düşüş
        let peak = values[0];
        let maxDd = 0;
        let peakDate = common[0];
        let troughDate = common[0];
        let curPeakDate = common[0];
        for (let i = 0; i < values.length; i++) {
          if (values[i] > peak) {
            peak = values[i];
            curPeakDate = common[i];
          }
          const dd = peak === 0 ? 0 : values[i] / peak - 1;
          if (dd < maxDd) {
            maxDd = dd;
            peakDate = curPeakDate;
            troughDate = common[i];
          }
        }

        // Varlık bazlı katkı (USD bazında, ilk/son değer farkı)
        const contributions = positions
          .filter((p) => series.has(p.symbol))
          .map((p) => {
            const m = series.get(p.symbol) as Map<string, number>;
            const firstPx = m.get(common[0]) as number;
            const lastPx = m.get(common[common.length - 1]) as number;
            const assetReturn = firstPx === 0 ? 0 : lastPx / firstPx - 1;
            const isTry = p.symbol.toUpperCase().endsWith(".IS");
            let firstUsd = firstPx * p.quantity;
            if (isTry && rateAt(common[0])) firstUsd /= rateAt(common[0]) as number;
            return {
              symbol: p.symbol,
              quantity: p.quantity,
              currency: isTry ? "TRY" : "USD",
              firstClose: round(firstPx),
              lastClose: round(lastPx),
              assetReturn: round(assetReturn * 100),
              usdValueShare: round((firstUsd / first) * 100),
            };
          });

        // Kur etkisi: sadece TRY varlıkların TL bazlı performansı
        const tryValues = daily.map((d) => d.valueTry);
        const tryReturn =
          tryValues[0] > 0 ? tryValues[tryValues.length - 1] / tryValues[0] - 1 : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  period,
                  interval,
                  dataPoints: common.length,
                  startDate: common[0],
                  endDate: common[common.length - 1],
                  metricsUsd: {
                    initialValue: round(first),
                    finalValue: round(lastV),
                    totalReturn: round(totalReturn * 100),
                    cagr: cagr === null ? null : round(cagr * 100),
                    volatility: round(vol * 100),
                    maxDrawdown: round(maxDd * 100),
                    maxDrawdownPeriod: `${peakDate} → ${troughDate}`,
                    sharpeRatio: round(sharpe),
                    riskFreeRate,
                  },
                  metricsTry: {
                    totalReturn: tryReturn === null ? null : round(tryReturn * 100),
                    note: "TRY cevirisi uygulanmadan, portföyün TL bazlı performansı (kur etkisini içerir).",
                  },
                  currencyEffect: hasTry
                    ? "Portföyde TRY varlıklar var: performans USD'ye çevrilerek hesaplandı, TL etkisi metricsTry'de."
                    : "Portföyde TRY varlık yok.",
                  contributions,
                  failedSymbols: failures,
                  source: "Yahoo Finance OHLC",
                  dataNote:
                    "Backtest geçmiş veriye dayalıdır; işlem komisyonu, vergi ve vade gerçekleşmemiş getirileri içermez. Yatırım tavsiyesi değildir.",
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
