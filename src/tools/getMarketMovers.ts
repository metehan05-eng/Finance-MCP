import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { getYahoo } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

const SCREENS = [
  "day_gainers",
  "day_losers",
  "most_actives",
  "growth_technology_stocks",
  "undervalued_large_caps",
  "aggressive_small_caps",
  "most_shorted_stocks",
  "portfolio_anchors",
] as const;

const SCREEN_LABELS: Record<string, string> = {
  day_gainers: "Günün en çok yükselenleri",
  day_losers: "Günün en çok düşenleri",
  most_actives: "En aktif (hacim) hisseler",
  growth_technology_stocks: "Büyüyen teknoloji hisseleri",
  undervalued_large_caps: "Değerinin altındaki büyük hisseler",
  aggressive_small_caps: "Agresif küçük hisseler",
  most_shorted_stocks: "En çok açığa satılan hisseler",
  portfolio_anchors: "Portföy çapaları (istikrarlı büyük şirketler)",
};

/**
 * Yahoo tarayıcı (screener) ile ön tanımlı hisse listeleri.
 */
export function registerGetMarketMovers(server: McpServer) {
  server.tool(
    "get_market_movers",
    "Yahoo Finance tarayıcısıyla hazır hisse listelerini döndürür: günün en çok yükselenleri/düşenleri, en aktifler, teknoloji büyüme, değer hisseleri vb. Piyasa taraması ve fırsat keşfi için kullanılır.",
    {
      screen: z
        .enum(SCREENS)
        .default("day_gainers")
        .describe("Tarama tipi (örn. day_gainers, day_losers, most_actives)"),
      region: z.string().length(2).default("US").describe("Bölge kodu (US, GB, DE, TR vb.)"),
      count: z.number().int().min(1).max(50).default(10).describe("Döndürülecek hisse sayısı"),
    },
    async ({ screen, region, count }) => {
      try {
        const yf = await getYahoo();
        const region_ = region.toUpperCase();

        // Yahoo tarayıcı uç noktası ara sıra "fetch failed" verir; 2 deneme
        let result: any = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2 && result === null; attempt++) {
          try {
            result = await yf.screener({ scrIds: screen, count, region: region_ });
          } catch (err) {
            lastError = err;
          }
        }
        if (result === null) {
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }

        const quotes: any[] = result?.quotes ?? [];
        if (quotes.length === 0) {
          return errorResponse(
            `'${screen}' taraması için '${region_}' bölgesinde sonuç bulunamadı.`
          );
        }

        const items = quotes.slice(0, count).map((q: any) => ({
          symbol: q.symbol,
          name: q.shortName ?? q.longName ?? null,
          price: q.regularMarketPrice ?? null,
          change: q.regularMarketChange ?? null,
          changePercent: round(q.regularMarketChangePercent),
          marketCap: q.marketCap ?? null,
          trailingPE: round(q.trailingPE),
          volume: q.regularMarketVolume ?? null,
          currency: q.currency ?? null,
          exchange: q.fullExchangeName ?? null,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  screen,
                  screenLabel: SCREEN_LABELS[screen] ?? screen,
                  region: region_,
                  total: result?.total ?? items.length,
                  count: items.length,
                  items,
                  source: "Yahoo Finance Screener",
                  dataNote:
                    "Tarama sonuçları düzenli güncellenir ancak kısa gecikme olabilir. Not: Yahoo tarayıcısı bazı listelerde bölge filtresini uygulamayabilir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `Piyasa taraması alınamadı: ${msg}. Bölge kodu geçerli mi (US, GB, DE)?`
        );
      }
    }
  );
}
