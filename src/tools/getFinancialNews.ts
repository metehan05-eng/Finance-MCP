import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { XMLParser } from "fast-xml-parser";

interface NewsItem {
  title: string;
  link: string;
  publishedAt: string;
  source: string | null;
}

const SUPPORTED_TICKERS = ["XU100.IS", "THYAO.IS", "%5EGSPC", "%5EIXIC", "AAPL", "TSLA", "BTC-USD", "USDTRY=X"];

/**
 * Yahoo Finance RSS haber akışını ayrıştırır.
 */
async function fetchNews(ticker: string, region: string, lang: string, limit: number): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=${region}&lang=${lang}`;
  const resp = await fetchWithRetry(url, {
    headers: { Accept: "application/rss+xml", "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error(`RSS yanıt yok (HTTP ${resp.status})`);

  const xml = await resp.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.feed ?? {};
  const rawItems: any[] = channel.item ?? channel.entry ?? [];

  return (Array.isArray(rawItems) ? rawItems : [rawItems])
    .slice(0, limit)
    .map((i) => ({
      title: (i.title ?? "").toString(),
      link: (i.link ?? "").toString(),
      publishedAt: (i.pubDate ?? "").toString(),
      source: i.source != null ? i.source : null,
    }))
    .filter((n) => n.title);
}

/**
 * Hisse / endeks / kripto hakkındaki güncel haberler (Yahoo Finance RSS).
 */
export function registerGetFinancialNews(server: McpServer) {
  server.tool(
    "get_financial_news",
    "Bir hisse, endeks, kripto veya para birimi hakkındaki güncel finans haberlerini döndürür. Kaynak: Yahoo Finance RSS. Örn: XU100.IS (TR), THYAO.IS, AAPL, BTC-USD, USDTRY=X.",
    {
      ticker: z
        .string()
        .min(1)
        .default("XU100.IS")
        .describe(
          "Haber istenen sembol. BIST için '.IS': 'THYAO.IS', 'XU100.IS'; küresel: 'AAPL', 'TSLA'; kripto: 'BTC-USD'; dolar: 'USDTRY=X'."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(15)
        .default(10)
        .describe("Döndürülecek başlık sayısı (default: 10)"),
    },
    async ({ ticker, limit }) => {
      const t = ticker.trim().toUpperCase();

      // Yayın dili/bölge tahmini
      const isBist = t.endsWith(".IS") || SUPPORTED_TICKERS.includes(t.toUpperCase());
      const region = isBist ? "TR" : "US";
      const lang = isBist ? "tr-TR" : "en-US";

      try {
        const news = await fetchNews(t, region, lang, limit);

        if (news.length === 0) {
          return errorResponse(`'${t}' için haber bulunamadı. Sembol kontrol edin veya XU100.IS deneyin.`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ticker: t,
                  region,
                  itemCount: news.length,
                  items: news,
                  source: "Yahoo Finance RSS",
                  dataNote: "Haber başlıkları otomatik toplanmıştır, yatırım kararı için ek kaynak doğrulayın.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Haber alınamadı: ${msg}`);
      }
    }
  );
}