import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { parseTrNumber, round } from "../utils/financeMath.js";

const VIOP_URL = "https://www.oyakyatirim.com.tr/viop";

interface ViopContract {
  code: string;
  description: string | null;
  last: number | null;
  changePct: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
}

function parseViopRows(html: string): ViopContract[] {
  const rows: ViopContract[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;

  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    const cRe = new RegExp(tdRe.source, "g");
    const rowHtml = m[1];
    while ((c = cRe.exec(rowHtml)) !== null) {
      cells.push(c[1].replace(/<[^>]+>/g, "").trim());
    }

    // VIOP satırı: en az 6 hücre ve ilk hücre kontrat kodu (F_...) olmalı
    if (cells.length >= 6 && /^F_\w+$/i.test(cells[0])) {
      const nums = cells.slice(2).map((c) => parseTrNumber(c));
      if (nums.some((n) => n === null)) continue;

      rows.push({
        code: cells[0],
        description: cells[1] || null,
        last: nums[0],
        changePct: nums[1],
        bid: nums[2],
        ask: nums[3],
        volume: nums[4],
      });
    }
  }
  return rows;
}

/**
 * VİOP vadeli işlem kontrat fiyatları (BIST 30, endeks, dolar, altın vb.).
 * Kaynak: OYAK Yatırım VİOP sayfası (gün sonu / önceki kapanış bazlı).
 */
export function registerGetViopQuote(server: McpServer) {
  server.tool(
    "get_viop_quote",
    "Vadeli İşlem ve Opsiyon Piyasası (VİOP) kontratlarının fiyat, değişim, alış/satış ve hacim bilgilerini döndürür. Belirli bir kontrat parsent verisi için ş/kod filtresi uygulanabilir. Örn: 'F_X10XB1026' veya 'X10'.",
    {
      search: z
        .string()
        .optional()
        .describe(
          "Kontrat filteresi: kontrat kodu (F_X10XB1026) veya vade/nakde kodu. Boş bırakılırsa tüm kontratlar döner."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(20)
        .describe("Döndürülecek maksimum kontrat sayısı"),
    },
    async ({ search, limit }) => {
      try {
        const resp = await fetchWithRetry(VIOP_URL, {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            Accept: "text/html",
          },
        });

        if (!resp.ok) {
          return errorResponse(`VİOP sayfasına erişilemedi (HTTP ${resp.status}).`);
        }

        const html = await resp.text();
        let contracts = parseViopRows(html);

        if (contracts.length === 0) {
          return errorResponse("VİOP kontrat tablosu ayrıştırılamadı veya boş.");
        }

        if (search) {
          const q = search.trim().toUpperCase();
          contracts = contracts.filter(
            (c) =>
              c.code.toUpperCase().includes(q) ||
              (c.description ?? "").toUpperCase().includes(q)
          );
        }

        const view = contracts.slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: search ?? "hepsi",
                  totalContracts: contracts.length,
                  shown: view.length,
                  contracts: view,
                  source: "OYAK Yatırım VİOP",
                  dataNote:
                    "Yaklaşık gün sonu verisidir; seans içi canlı fiyatlar borsadan alınmalıdır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`VİOP verisi alınamadı: ${msg}`);
      }
    }
  );
}