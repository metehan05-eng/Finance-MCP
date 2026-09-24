import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchOhlc, PERIOD_DAYS } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Hisse senedi geçmiş fiyat / grafik (OHLC) verisi.
 * Yahoo Finance üzerinden; BIST dahil tüm borsaları destekler.
 */
export function registerGetStockHistory(server: McpServer) {
  server.tool(
    "get_stock_history",
    "Bir hisse senedinin (BIST veya küresel) geçmiş açılış/en yüksek/en düşük/kapanış (OHLC) ve hacim verisini döndürür. Teknik analiz ve grafik çizimi için kullanılır. Örn: THYAO.IS, AAPL, NVDA, ASELS.IS",
    {
      symbol: z
        .string()
        .min(1)
        .describe(
          "Sembol. BIST için koda '.IS' ekleyin (örn. THYAO.IS, ASELS.IS). Küresel için AAPL, NVDA, MSFT gibi. BIST kodu uzantısız girilirse otomatik '.IS' denenecektir."
        ),
      period: z
        .enum(["1w", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"])
        .default("1y")
        .describe("Geriye dönük veri aralığı (örn. 1y = son 1 yıl)"),
      interval: z
        .enum(["1d", "1wk", "1mo"])
        .default("1d")
        .describe("Mum periyodu: günlük, haftalık veya aylık"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Özel başlangıç tarihi (YYYY-MM-DD). Verilirse period dikkate alınmaz."),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Özel bitiş tarihi (YYYY-MM-DD). Varsayılan: bugün"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .default(250)
        .describe("Döndürülecek maksimum veri noktası sayısı (default: 250)"),
    },
    async ({ symbol, period, interval, startDate, endDate, limit }) => {
      const input = symbol.trim().toUpperCase();

      try {
        // `.IS` ile biten sembol sadece BIST olarak denenir; değilse önce doğrudan,
        // veri yoksa `.IS` eklenerek (BIST) denenir.
        const onlyBist = input.endsWith(".IS");
        const directSymbol = onlyBist ? input : input;

        let chart = onlyBist
          ? await fetchOhlc(directSymbol, { period, interval, startDate, endDate })
          : await tryBoth(input, period, interval, startDate, endDate);

        if (chart.rows.length === 0) {
          return errorResponse(
            `'${symbol}' için geçmiş veri bulunamadı. BIST için THYAO.IS, küresel için AAPL gibi sembol girin.`
          );
        }

        const rows = chart.rows.slice(-limit).map((r) => ({
          date: r.date.slice(0, 10),
          open: round(r.open),
          high: round(r.high),
          low: round(r.low),
          close: round(r.close),
          adjClose: round(r.adjClose),
          volume: r.volume,
        }));

        const closes = chart.rows.filter((r) => r.close !== null).map((r) => r.close as number);
        const first = closes[0];
        const last = closes[closes.length - 1];
        const change = first != null && last != null ? last - first : null;
        const changePercent = first && change != null ? (change / first) * 100 : null;
        const minLow = Math.min(...chart.rows.map((r) => r.low ?? Infinity));
        const maxHigh = Math.max(...chart.rows.map((r) => r.high ?? -Infinity));
        const avgVolume = chart.rows.length
          ? chart.rows.reduce((a, r) => a + (r.volume ?? 0), 0) / chart.rows.length
          : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: chart.symbol.replace(/\.IS$/i, ""),
                  currency: chart.currency,
                  exchange: chart.exchange,
                  period: startDate ? `${startDate} → ${endDate ?? "bugün"}` : period,
                  interval,
                  dataPoints: rows.length,
                  summary: {
                    firstClose: round(first),
                    lastClose: round(last),
                    change: round(change),
                    changePercent: round(changePercent),
                    periodLow: round(minLow),
                    periodHigh: round(maxHigh),
                    avgVolume: avgVolume ? Math.round(avgVolume) : null,
                  },
                  data: rows,
                  source: "Yahoo Finance",
                  dataNote: "Veriler 15 dakika gecikmeli olabilir. Yatırım tavsiyesi değildir.",
                },
                null,
                0
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.toLowerCase().includes("no data") ||
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("bulunamadı")
        ) {
          return errorResponse(
            `'${symbol}' için geçmiş veri bulunamadı. BIST için THYAO.IS, küresel için AAPL gibi sembol girin.`
          );
        }
        return errorResponse(`Veri alınamadı: ${msg}`);
      }
    }
  );
}

/**
 * Önce doğrudan, sonuç yoksa BIST (`.IS`) uzantısıyla dener.
 * Tek denemenin başarısızlığı diğer denemeyi engellemez.
 */
async function tryBoth(
  input: string,
  period: string,
  interval: string,
  startDate?: string,
  endDate?: string
): Promise<import("../utils/yahoo.js").ChartResult> {
  let direct: import("../utils/yahoo.js").ChartResult | null = null;
  try {
    direct = await fetchOhlc(input, { period, interval, startDate, endDate });
  } catch {
    /* doğrudan sembol geçersiz olabilir */
  }

  if (direct && direct.rows.length > 0 && !input.toUpperCase().endsWith(".IS")) {
    return direct;
  }

  try {
    const breve = input.toUpperCase().endsWith(".IS") ? input : `${input}.IS`;
    const bist = await fetchOhlc(breve, { period, interval, startDate, endDate });
    if (bist.rows.length > 0) return bist;
  } catch {
    /* BIST denemesi de başarısız olabilir */
  }

  if (direct) return direct;
  throw new Error("Sembol bulunamadı");
}