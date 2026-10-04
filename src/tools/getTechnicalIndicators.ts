import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { tryBoth } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";
import {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  atr,
  rsiInterpretation,
  bollingerPosition,
} from "../utils/indicators.js";

const INDICATOR_OPTIONS = [
  "rsi14",
  "sma20",
  "sma50",
  "sma200",
  "ema12",
  "ema26",
  "macd",
  "bollinger",
  "atr14",
] as const;

/**
 * OHLC geçmişinden teknik indikatörleri hesaplar.
 */
export function registerGetTechnicalIndicators(server: McpServer) {
  server.tool(
    "get_technical_indicators",
    "Bir hissenin OHLC geçmişi üzerinden teknik indikatörleri hesaplar: RSI(14), SMA(20/50/200), EMA(12/26), MACD(12/26/9), Bollinger bantları(20,2σ) ve ATR(14). Son N mumda indikatör değerleri + güncel sinyal yorumu döner. Örn: THYAO.IS, AAPL, BTC-USD.",
    {
      symbol: z
        .string()
        .min(1)
        .describe("Sembol: THYAO.IS, ASELS.IS, AAPL, NVDA, BTC-USD (BIST için .IS eklenmeli)"),
      period: z
        .enum(["3mo", "6mo", "1y", "2y", "5y"])
        .default("1y")
        .describe("İndikatör hesabı için geriye dönük veri aralığı"),
      interval: z
        .enum(["1d", "1wk", "1mo"])
        .default("1d")
        .describe("Mum periyodu (günlük/haftalık/aylık)"),
      indicators: z
        .array(z.enum(INDICATOR_OPTIONS))
        .min(1)
        .default([...INDICATOR_OPTIONS])
        .describe("Hesaplanacak indikatörler"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(120)
        .default(60)
        .describe("Döndürülecek son mum sayısı (default: 60)"),
      compact: z
        .boolean()
        .default(false)
        .describe(
          "true ise tabloyu atlayıp yalnızca son sinyal özetini döndürür (token tasarrufu)"
        ),
    },
    async ({ symbol, period, interval, indicators, limit, compact }) => {
      try {
        const chart = await tryBoth(symbol.trim().toUpperCase(), period, interval);

        if (chart.rows.length < 30) {
          return errorResponse(
            `'${symbol}' için yeterli OHLC verisi yok (${chart.rows.length} mum). Aralığı büyütün (örn. 1y/2y).`
          );
        }

        const closes = chart.rows.map((r) => r.close as number);
        const highs = chart.rows.map((r) => r.high ?? (r.close as number));
        const lows = chart.rows.map((r) => r.low ?? (r.close as number));
        const dates = chart.rows.map((r) => r.date.slice(0, 10));

        const want = new Set(indicators);
        const data = {
          rsi14: want.has("rsi14") ? rsi(closes, 14) : null,
          sma20: want.has("sma20") ? sma(closes, 20) : null,
          sma50: want.has("sma50") ? sma(closes, 50) : null,
          sma200: want.has("sma200") ? sma(closes, 200) : null,
          ema12: want.has("ema12") ? ema(closes, 12) : null,
          ema26: want.has("ema26") ? ema(closes, 26) : null,
          macd: want.has("macd") ? macd(closes) : null,
          bollinger: want.has("bollinger") ? bollinger(closes) : null,
          atr14: want.has("atr14") ? atr(highs, lows, closes, 14) : null,
        };

        // Son N mumun birleştirilmiş tablosu
        const startIdx = chart.rows.length - limit;
        const rows = [];
        for (let i = startIdx; i < chart.rows.length; i++) {
          const row: Record<string, number | string | null> = {
            date: dates[i],
            close: round(closes[i]),
          };
          if (data.rsi14) row.rsi14 = round(data.rsi14[i]);
          if (data.sma20) row.sma20 = round(data.sma20[i]);
          if (data.sma50) row.sma50 = round(data.sma50[i]);
          if (data.sma200) row.sma200 = round(data.sma200[i]);
          if (data.ema12) row.ema12 = round(data.ema12[i]);
          if (data.ema26) row.ema26 = round(data.ema26[i]);
          if (data.macd) {
            row.macd = round(data.macd.macd[i]);
            row.macdSignal = round(data.macd.signal[i]);
            row.macdHistogram = round(data.macd.histogram[i]);
          }
          if (data.bollinger) {
            row.bollingerUpper = round(data.bollinger.upper[i]);
            row.bollingerMiddle = round(data.bollinger.middle[i]);
            row.bollingerLower = round(data.bollinger.lower[i]);
          }
          if (data.atr14) row.atr14 = round(data.atr14[i]);
          rows.push(row);
        }

        // Güncel sinyal özeti (son satır)
        const i = chart.rows.length - 1;
        const last: Record<string, number | string | null> = {
          price: round(closes[i]),
          rsi: data.rsi14 ? round(data.rsi14[i]) : null,
          rsiSignal: data.rsi14 ? rsiInterpretation(data.rsi14[i]) : null,
          sma20: data.sma20 ? round(data.sma20[i]) : null,
          sma50: data.sma50 ? round(data.sma50[i]) : null,
          sma200: data.sma200 ? round(data.sma200[i]) : null,
          priceVsSma20:
            data.sma20 && data.sma20[i] != null
              ? closes[i] >= (data.sma20[i] as number)
                ? "üzerinde"
                : "altında"
              : null,
          priceVsSma50:
            data.sma50 && data.sma50[i] != null
              ? closes[i] >= (data.sma50[i] as number)
                ? "üzerinde"
                : "altında"
              : null,
        };
        if (data.macd) {
          last.macd = round(data.macd.macd[i]);
          last.macdSignal = round(data.macd.signal[i]);
          last.macdCross =
            data.macd.macd[i] != null && data.macd.signal[i] != null
              ? (data.macd.macd[i] as number) >= (data.macd.signal[i] as number)
                ? "MACD sinyal üzerinde (pozitif)"
                : "MACD sinyal altında (negatif)"
              : null;
        }
        if (data.bollinger) {
          last.bollingerPosition = bollingerPosition(
            closes[i],
            data.bollinger.upper[i],
            data.bollinger.lower[i]
          );
        }
        if (data.atr14) last.atr14 = round(data.atr14[i]);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: chart.symbol.replace(/\.IS$/i, ""),
                  currency: chart.currency,
                  exchange: chart.exchange,
                  period,
                  interval,
                  totalBars: chart.rows.length,
                  dataPoints: compact ? 0 : rows.length,
                  lastSignal: last,
                  data: compact ? undefined : rows,
                  compact,
                  source: "Yahoo Finance (OHLC) + yerel hesaplama",
                  dataNote:
                    "İndikatörler saf hesaplamadır, yatırım tavsiyesi değildir. SMA200 için en az 200 mum gereklidir.",
                },
                null,
                1
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `Teknik indikatör hesaplanamadı: ${msg}. Sembolü kontrol edin (THYAO.IS, AAPL).`
        );
      }
    }
  );
}
