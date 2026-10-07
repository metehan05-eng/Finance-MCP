import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuoteSummary } from "../utils/yahoo.js";

export interface CompanyProfile {
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  website: string | null;
  summary: string | null;
}

/** summaryProfile ham nesnesini normalize eder (alanlar borsaya göre değişiyor). */
export function normalizeProfile(raw: Record<string, unknown> | undefined): CompanyProfile {
  const p = (raw ?? {}) as Record<string, any>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  return {
    sector: str(p.sector),
    industry: str(p.industry),
    country: str(p.country),
    employees: num(p.fullTimeEmployees),
    website: str(p.website),
    summary: str(p.longBusinessSummary),
  };
}

/** İş özetini LLM için kısaltır. */
export function clampSummary(summary: string | null, maxChars: number): string | null {
  if (!summary) return null;
  if (maxChars <= 0) return null;
  if (summary.length <= maxChars) return summary;
  return summary.slice(0, maxChars).trimEnd() + "…";
}

/**
 * Şirket profili: sektör, sanayi, ülke, çalışan sayısı ve iş özeti.
 * BIST dahil tüm borsalar (Yahoo summaryProfile).
 */
/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface ProfileDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuoteSummary: typeof fetchQuoteSummary;
}

export const DEFAULT_PROFILE_DEPS: ProfileDeps = { resolveTickers, fetchQuoteSummary };

export function registerGetCompanyProfile(
  server: McpServer,
  deps: ProfileDeps = DEFAULT_PROFILE_DEPS
) {
  server.tool(
    "get_company_profile",
    "Bir şirketin profil bilgilerini döndürür: sektör, sanayi, ülke, çalışan sayısı, web sitesi ve iş özeti. BIST dahil tüm borsaları destekler. Örn: 'THYAO hangi sektörde?'",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO, THYAO.IS, AAPL, GARAN)"),
      summaryLength: z
        .number()
        .int()
        .min(0)
        .max(2000)
        .default(600)
        .describe("İş özeti karakter sınırı (0 = özet gizlenir)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, summaryLength }) => {
      try {
        const upper = symbol.toUpperCase();
        const resolved = (await deps.resolveTickers([upper])).get(upper) ?? upper;
        const data = await deps.fetchQuoteSummary(resolved, ["summaryProfile", "price"]);

        const profile = normalizeProfile(data.summaryProfile);
        const price = data.price ?? {};

        if (!profile.sector && !profile.industry && !profile.summary) {
          return errorResponse(`"${resolved}" için profil verisi eksik (sektör/sanayi boş).`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                symbol: resolved,
                name: price.longName ?? price.shortName ?? null,
                sector: profile.sector,
                industry: profile.industry,
                country: profile.country,
                employees: profile.employees,
                website: profile.website,
                summary: clampSummary(profile.summary, summaryLength),
                currency: price.currency ?? null,
                exchange: price.exchangeName ?? null,
                source: "Yahoo Finance (summaryProfile)",
              }),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `Şirket profili alınamadı (${symbol}): ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      }
    }
  );
}
