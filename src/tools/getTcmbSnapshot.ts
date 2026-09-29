import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";
import { fetchPolicyRateHistory } from "./getPolicyRate.js";

const TROY_OUNCE_IN_GRAMS = 31.1034768;

const CURRENCIES: Array<{ symbol: string; name: string }> = [
  { symbol: "USDTRY=X", name: "USD/TRY" },
  { symbol: "EURTRY=X", name: "EUR/TRY" },
  { symbol: "GBPTRY=X", name: "GBP/TRY" },
  { symbol: "CHFTRY=X", name: "CHF/TRY" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
];

/**
 * Türkiye ekonomik göstergeleri anlık görüntüsü (kitaplık/özet).
 */
export function registerGetTcmbSnapshot(server: McpServer) {
  server.tool(
    "get_tcmb_snapshot",
    "Türkiye ekonomik göstergelerinin anlık özetini döndürür: ana döviz kurları (USD/TRY, EUR/TRY, GBP/TRY, CHF/TRY, EUR/USD), TCMB politika faizi, ABD 10 yıl tahvil faizi ve gram altın fiyatı. Hızlı 'Türkiye nasıl gidiyor' özeti için.",
    {},
    async () => {
      try {
        // Kur + altın + tahvil: tek toplu kotasyon (hata olursa bölüm bölüm dene)
        let quotes: any[] = [];
        let quoteError: string | null = null;
        try {
          quotes = await fetchQuotes([...CURRENCIES.map((c) => c.symbol), "GC=F", "^TNX"]);
        } catch (err) {
          quoteError = err instanceof Error ? err.message : String(err);
        }
        const bySymbol = new Map(
          quotes.filter((q: any) => q?.symbol).map((q: any) => [q.symbol, q])
        );

        const currencies = CURRENCIES.map((c) => {
          const q: any = bySymbol.get(c.symbol) ?? {};
          return {
            pair: c.name,
            rate: round(q.regularMarketPrice),
            changePercent: round(q.regularMarketChangePercent),
          };
        });

        const gold: any = bySymbol.get("GC=F");
        const tnx: any = bySymbol.get("^TNX");
        const usdTry = bySymbol.get("USDTRY=X")?.regularMarketPrice ?? null;
        const gramUsd =
          gold?.regularMarketPrice != null ? gold.regularMarketPrice / TROY_OUNCE_IN_GRAMS : null;

        // Politika faizi (hata olursa snapshot yine de döner)
        let policyRate: number | null = null;
        let policySince: string | null = null;
        let previousRate: number | null = null;
        try {
          const changes = await fetchPolicyRateHistory();
          if (changes.length > 0) {
            const current = changes[changes.length - 1];
            policyRate = current.rate;
            policySince = current.date;
            if (changes.length > 1) previousRate = changes[changes.length - 2].rate;
          }
        } catch {
          /* TCMB erişilemezse diğer alanlar döner */
        }

        const available = currencies.some((c) => c.rate !== null) || policyRate !== null;
        if (!available) {
          return errorResponse(
            `Türkiye göstergeleri alınamadı. Kaynak hatası: ${quoteError ?? "bilinmiyor"}`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  kur: currencies,
                  politikaFaizi: {
                    current: policyRate,
                    unit: "% (1 hafta repo, yıllık)",
                    since: policySince,
                    previous: previousRate,
                    direction:
                      policyRate === null || previousRate === null
                        ? null
                        : policyRate > previousRate
                          ? "yükseltildi (sıkılaştırma)"
                          : policyRate < previousRate
                            ? "düşürüldü (gevşeme)"
                            : "değişiklik yok",
                    source: "TCMB",
                  },
                  abd10YildalikTahvil: {
                    value: round(tnx?.regularMarketPrice),
                    unit: "%",
                    change: round(tnx?.regularMarketChange),
                  },
                  altin: {
                    ounceUsd: round(gold?.regularMarketPrice),
                    gramUsd: round(gramUsd),
                    gramTry: gramUsd !== null && usdTry !== null ? round(gramUsd * usdTry) : null,
                  },
                  sources: ["Yahoo Finance", "TCMB"],
                  dataNote:
                    "Gösterge özetidir; resmî veri (TÜİK enflasyon, TCMB bakiye özeti) için get_macro_indicators / get_inflation_data araçlarını kullanın. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Türkiye göstergeleri alınamadı: ${msg}`);
      }
    }
  );
}
