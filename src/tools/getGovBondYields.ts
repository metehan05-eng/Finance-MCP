import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { parseTrNumber, round } from "../utils/financeMath.js";

const DOVIZ_10Y_URL = "https://www.doviz.com/tahvil/tr-10-yillik-tahvil";

interface SocketValue {
  key: string;
  attr: string;
  value: string;
}

function extractSocketValues(html: string): SocketValue[] {
  const pattern = /data-socket-key="([^"]+)"[^>]*data-socket-attr="([^"]+)"[^>]*>([^<]*)/g;
  const out: SocketValue[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const value = (m[3] ?? "").trim();
    if (value) out.push({ key: m[1], attr: m[2], value });
  }
  return out;
}

/**
 * Türkiye devlet tahvil faizleri: 10 yıllık ve gösterge (referans) tahvil.
 * Kaynak: doviz.com (ikincil/anonim toplayıcı).
 */
export function registerGetGovBondYields(server: McpServer) {
  server.tool(
    "get_gov_bond_yields",
    "Türkiye 10 yıllık devlet tahvili faizini ve gösterge (referans/2 yıllık) tahvil faizini döndürür. Kaynak: doviz.com tahvil bülteni.",
    {},
    async () => {
      try {
        const response = await fetchWithRetry(DOVIZ_10Y_URL, {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            Accept: "text/html",
          },
        });

        if (!response.ok) {
          return errorResponse(`Tahvil sayfasına erişilemedi (HTTP ${response.status}).`);
        }

        const html = await response.text();
        const values = extractSocketValues(html);

        const getValue = (key: string, attr = "s") =>
          values.find((v) => v.key === key && v.attr === attr)?.value ?? null;

        const rate10 = getValue("TAHVIL10Y", "s");
        const change10 = getValue("TAHVIL10Y", "c");
        const change10Pts = getValue("TAHVIL10Y", "a");
        const rateBench = getValue("TAHVIL", "s");
        const changeBench = getValue("TAHVIL", "c");

        const r10 = parseTrNumber(rate10);

        if (r10 === null) {
          return errorResponse("Tahvil faiz değerleri sayfadan ayrıştırılamadı.");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  tenYearYield: round(r10, 2),
                  tenYearChangePct: change10 ?? null,
                  tenYearChangePts: change10Pts ? round(parseTrNumber(change10Pts), 4) : null,
                  benchmarkYield: rateBench ? round(parseTrNumber(rateBench), 2) : null,
                  benchmarkChangePct: changeBench ?? null,
                  unit: "% (yıllık bileşik faiz)",
                  source: "doviz.com (ikincil toplayıcı)",
                  dataNote:
                    "İkincil piyasa güncel verisidir. Yatırım tavsiyesi değildir; resmi veriler için TCMB/HMB'yi teyit edin.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Tahvil faizi alınamadı: ${msg}`);
      }
    }
  );
}