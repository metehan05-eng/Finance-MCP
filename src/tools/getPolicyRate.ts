import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

const TCMB_REPO_URL =
  "https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/temel+faaliyetler/para+politikasi/merkez+bankasi+faiz+oranlari/1+hafta+repo";

interface RateChange {
  date: string;
  rate: number;
}

function parseRateTable(html: string): RateChange[] {
  const rows: RateChange[] = [];
  const tdPattern = /<td[^>]*>(.*?)<\/td>/g;

  let match: RegExpExecArray | null;
  let cells: string[] = [];

  // Her <tr> bloğunu ayır
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const trRe = new RegExp(trPattern.source, "g");

  while ((match = trRe.exec(html)) !== null) {
    const rowHtml = match[1];
    cells = [];
    let cellMatch: RegExpExecArray | null;
    const cellRe = new RegExp(tdPattern.source, "g");
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length >= 3 && /^\d{2}\.\d{2}\.\d{4}$/.test(cells[0])) {
      const rate = parseFloat(cells[2]?.replace(",", "."));
      if (!isNaN(rate)) {
        rows.push({ date: cells[0], rate });
      }
    }
  }

  return rows;
}

/**
 * TCMB resmi '1 Hafta Repo' sayfasından politika faizini (ve geçmiş faiz
 * değişikliklerini) çeker.
 */
export function registerGetPolicyRate(server: McpServer) {
  server.tool(
    "get_policy_rate",
    "TCMB politika faizini (1 hafta vadeli repo) ve geçmiş faiz değişikliklerini döndürür. Kaynak: TCMB resmi web sitesi faiz oranları tablosu.",
    {
      history: z
        .number()
        .int()
        .min(1)
        .max(58)
        .default(20)
        .describe("Geriye dönük kaç faiz değişikliği gösterilsin (max 58)"),
    },
    async ({ history }) => {
      try {
        const response = await fetchWithRetry(TCMB_REPO_URL, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html,application/xhtml+xml",
          },
        });

        if (!response.ok) {
          return errorResponse(`TCMB sayfasına erişilemedi (HTTP ${response.status}).`);
        }

        const html = await response.text();
        const changes = parseRateTable(html);

        if (changes.length === 0) {
          return errorResponse("TCMB faiz tablosu ayrıştırılamadı veya boş.");
        }

        const current = changes[changes.length - 1];
        const list = changes.slice(-history).reverse();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  currentPolicyRate: current.rate,
                  currentSince: current.date,
                  unit: "% (yıllık)",
                  lastChanges: list,
                  changeCount: changes.length,
                  source: "TCMB (Türkiye Cumhuriyet Merkez Bankası)",
                  url: TCMB_REPO_URL,
                  dataNote:
                    "Politika faizi = 1 hafta vadeli repo ihale faiz oranı. PPK toplantıları sonrası güncellenir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Politika faizi alınamadı: ${msg}`);
      }
    }
  );
}