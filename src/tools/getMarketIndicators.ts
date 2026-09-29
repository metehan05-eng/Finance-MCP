import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

const INDICATORS: Array<{
  symbol: string;
  name: string;
  group: "volatility" | "yields" | "fx";
  unit: string;
}> = [
  { symbol: "^VIX", name: "VIX (Korku Endeksi)", group: "volatility", unit: "puan" },
  { symbol: "^IRX", name: "ABD 13 Hafta Tahvil", group: "yields", unit: "%" },
  { symbol: "^FVX", name: "ABD 5 Yıl Tahvil", group: "yields", unit: "%" },
  { symbol: "^TNX", name: "ABD 10 Yıl Tahvil", group: "yields", unit: "%" },
  { symbol: "^TYX", name: "ABD 30 Yıl Tahvil", group: "yields", unit: "%" },
  { symbol: "DX-Y.NYB", name: "Dolar Endeksi (DXY)", group: "fx", unit: "puan" },
];

function vixInterpretation(v: number | null): string | null {
  if (v === null) return null;
  if (v < 15) return "düşük oynaklık / piyasa sakin";
  if (v < 20) return "normal";
  if (v < 30) return "yükselen endişe";
  return "yüksek korku / stresli piyasa";
}

/**
 * Piyasa riski göstergeleri: VIX, ABD tahvil faizleri ve dolar endeksi.
 */
export function registerGetMarketIndicators(server: McpServer) {
  server.tool(
    "get_market_indicators",
    "Makro piyasa göstergelerini tek çağrıda döndürür: VIX (korku endeksi), ABD 13 hafta/5/10/30 yıl tahvil faizleri ve Dolar Endeksi (DXY). Piyasa risk iştahı ve getiri eğrisi analizi için.",
    {},
    async () => {
      try {
        const quotes = await fetchQuotes(INDICATORS.map((i) => i.symbol));
        const bySymbol = new Map(
          quotes.filter((q: any) => q?.symbol).map((q: any) => [q.symbol, q])
        );

        const items = INDICATORS.map((i) => {
          const q: any = bySymbol.get(i.symbol) ?? {};
          return {
            symbol: i.symbol,
            name: i.name,
            group: i.group,
            unit: i.unit,
            value: q.regularMarketPrice ?? null,
            change: q.regularMarketChange ?? null,
            changePercent: round(q.regularMarketChangePercent),
          };
        });

        const vix = items.find((i) => i.symbol === "^VIX")?.value ?? null;
        const y10 = items.find((i) => i.symbol === "^TNX")?.value ?? null;
        const y3m = items.find((i) => i.symbol === "^IRX")?.value ?? null;
        const inverted = y3m !== null && y10 !== null ? y10 < y3m : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  indicators: items,
                  summary: {
                    vix,
                    vixInterpretation: vixInterpretation(vix),
                    us10y: y10,
                    us3m: y3m,
                    yieldCurveInverted: inverted,
                    yieldCurveNote:
                      inverted === true
                        ? "Getiri eğrisi ters (3 ay > 10 yıl) — resesyon sinyali olabilir."
                        : inverted === false
                          ? "Getiri eğrisi normal."
                          : null,
                  },
                  source: "Yahoo Finance",
                  dataNote: "Tahvil getirileri endeks kotasyonlarıdır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Piyasa göstergeleri alınamadı: ${msg}`);
      }
    }
  );
}
