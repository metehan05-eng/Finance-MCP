import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { parseTrNumber, round } from "../utils/financeMath.js";

const FF_URLS = {
  thisweek: "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  today: "https://nfs.faireconomy.media/ff_calendar_today.json",
  tomorrow: "https://nfs.faireconomy.media/ff_calendar_tomorrow.json",
  nextweek: "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
};

const FF_DATE_RE = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Küresel ekonomik takvim: merkez bankası kararları, enflasyon, GSYİH istihdam verileri.
 * Kaynak: ForexFactory (ücretsiz, API anahtarı gerektirmez).
 */
export function registerGetEconomicCalendar(server: McpServer) {
  server.tool(
    "get_economic_calendar",
    "Küresel ekonomik takvim: merkez bankası faiz kararları, TÜFE, GSYİH, istihdam gibi makro verilerin resmi açıklanma takvimini döndürür. Ülke ve etki düzeyine göre filtrelenebilir.",
    {
      range: z
        .enum(["today", "tomorrow", "thisweek", "nextweek"])
        .default("thisweek")
        .describe("Zaman aralığı: today (bugün), tomorrow (yarın), thisweek (bu hafta), nextweek (gelecek hafta)"),
      country: z
        .string()
        .optional()
        .describe("Ülke filtresi (örn. 'TR', 'US', 'DE', 'EU'). Boş bırakılırsa tüm ülkeler"),
      impact: z
        .enum(["low", "medium", "high", "all"])
        .default("all")
        .describe("Ekonomik etki düzeyi filtresi (high = yüksek etkili)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(25)
        .describe("Döndürülecek maksimum etkinlik sayısı (default: 25)"),
    },
    async ({ range, country, impact, limit }) => {
      // ForexFactory feed'i zaman zaman ağır rate-limit uygular;
      // birkaç denemeyle ve bekleme ile esnek davranıyoruz.
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetchWithRetry(FF_URLS[range], {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          });

          if (resp.status === 429 || !resp.ok) {
            if (attempt < 3) {
              await sleep(3000 * attempt);
              continue;
            }
            return errorResponse(
              `ForexFactory takvimi şu anda yanıt vermedi (HTTP ${resp.status}). ${range === "thisweek" ? "Bu haftalık veri pilotu geçici olarak rate-limit'li olabilir; kısa süre sonra tekrar deneyin." : ""}`
            );
          }

          let items: any[];
          try {
            items = await resp.json();
          } catch {
            if (attempt < 3) {
              await sleep(3000 * attempt);
              continue;
            }
            return errorResponse(
              `ForexFactory takvimi geçersiz yanıt döndürdü (HTML muhtemelen 429 rate-limit). Kısa süre sonra tekrar deneyin.`
            );
          }

        const countryFilter = country == null ? null : country.trim().toUpperCase();
        const looksTurkish =
          countryFilter == null ||
          countryFilter === "ALL" ||
          ["TR", "TUR", "TURKEY", "TÜRK", "TÜRKIYE", "TURKIYE"].includes(countryFilter);

        let events = items.filter(
          (e: any) =>
            (countryFilter == null ||
              countryFilter === "ALL" ||
              (e.country ?? "").toUpperCase() === countryFilter ||
              (looksTurkish &&
                ((e.country ?? "").toUpperCase() === "TRY" ||
                  (e.title ?? "").toLowerCase().includes("turk") ||
                  (e.title ?? "").toLowerCase().includes("türk")))) &&
            (impact === "all" || (e.impact ?? "").toLowerCase() === impact.toLowerCase())
        );

        const availableCountries = [...new Set(items.map((e: any) => e.country).filter(Boolean))];
        const countryMeta = countryFilter === "ALL" ? "all" : countryFilter ?? country?.trim().toUpperCase() ?? "hepsi";

        events = events
          .map((e) => {
            const m = FF_DATE_RE.exec(e.date ?? "");
            return {
              date: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : e.date,
              country: e.country,
              title: e.title,
              impact: e.impact,
              actual: e.actual ?? null,
              forecast: e.forecast ?? null,
              previous: e.previous ?? null,
            };
          })
          .slice(0, limit);

        if (events.length === 0) {
          const countryLabel = country ?? "hepsi";
          const hint = countryLabel.toUpperCase() === "TR"
            ? `Bu hafta Türkiye için kayıtlı etkinlik yok. Verideki ülke kodları para birimi bazlıdır: ${availableCountries.join(", ")}.`
            : `Filtreye uyan etkinlik bulunamadı. Verideki ülke kodları: ${availableCountries.join(", ")}.`;
          return errorResponse(
            `range=${range}, country=${countryLabel}, impact=${impact} — ${hint}`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  range,
                  filter: { country: countryMeta, impact },
                  eventCount: events.length,
                  availableCountries,
                  events,
                  source: "ForexFactory Ekonomik Takvim",
                  dataNote:
                    "Açıklanma saatleri Tahahhüt (TSİ'ye çevrilmemiş, UTC bazlı). Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return errorResponse(`Ekonomik takvim alınamadı: ${msg}`);
        }
      }

      return errorResponse(
        `Ekonomik takvim şu anda yanıt vermiyor (rate-limit). Kısa süre sonra tekrar deneyin.`
      );
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}