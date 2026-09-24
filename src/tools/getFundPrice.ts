import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { parseTrNumber, round } from "../utils/financeMath.js";

const TEFAS_URL = "https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir";

interface TeFake {
  fonKodu: string;
  fonAd: string;
  fundType: string;
  date: string;
  price: number | null;
  changePct: number | null;
  analysis: string;
}

function tefasDataToFund(r: any): TeFake {
  const rawPrice = r.fiyat ?? r.nav;
  const price =
    typeof rawPrice === "number" && !isNaN(rawPrice)
      ? rawPrice
      : parseTrNumber(rawPrice);
  return {
    fonKodu: r.fonKodu ?? "",
    fonAd: r.fonUnvan ?? "",
    fundType: r.fonTipi ?? "YAT",
    date: r.tarih ?? "",
    price: price != null ? round(price, 6) : null,
    changePct: null,
    analysis: r.analiz ?? "",
  };
}

/**
 * TEFAS üzerindeki yatırım fonu fiyat bilgisi.
 * Fon koduyla (örn. GAF, ABA) son 1 aylık periyotlarla NAV/performans çeker.
 */
export function registerGetFundPrice(server: McpServer) {
  server.tool(
    "get_fund_price",
    "TEFAS'ta işlem gören bir yatırım fonunun (YAT/EMK...) güncel fiyatını (NAV) ve son dönem getirisini döndürür. Örn: GAF (Girişim), ABA (Aksiyo), fon kodu veya fon adı girilebilir.",
    {
      fundCode: z
        .string()
        .min(1)
        .describe("Fon kodu veya fon adı (örn. 'GAF', 'ABA', 'üniversite'...)"),
      days: z
        .number()
        .int()
        .min(7)
        .max(28)
        .default(28)
        .describe("Geriye dönük kaç gün gösterilsin (TEFAS istek başına en fazla 28 gün). Varsayılan 28."),
    },
    async ({ fundCode, days }) => {
      const code = fundCode.trim().toUpperCase();

      // Tarih aralığı (TEFAS formatı: YYYYMMDD)
      const to = new Date();
      const from = new Date(Date.now() - days * 86_400_000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any = {
        fonTipi: "YAT",
        fonKodu: code,
        aramaMetni: null,
        fonTurKod: null,
        fonGrubu: null,
        sfonTurKod: null,
        fonTurAciklama: null,
        kurucuKod: null,
        basTarih: fmt(from),
        bitTarih: fmt(to),
        basSira: 1,
        bitSira: 20,
        dil: "TR",
        sFonTurKod: "",
        fonKod: "",
        fonGrup: "",
        fonUnvanTip: "",
      };

      // Tam kod eşleşmesi; boş dönerse adla arama denenir
      let json: any;
      try {
        const resp = await fetchWithRetry(TEFAS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: "https://www.tefas.gov.tr",
            Referer: "https://www.tefas.gov.tr/tr/fon-verileri",
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          return errorResponse(`TEFAS API yanıt vermedi (HTTP ${resp.status}).`);
        }
        json = await resp.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`TEFAS API'ye ulaşılamadı: ${msg}`);
      }

      const raw: any[] = extractResultList(json);

      if (raw.length === 0 && !codeHasWildcards(code)) {
        // Ad aramasıyla ikinci deneme
        body.aramaMetni = code;
        body.fonKodu = "";
        const retry = await fetchWithRetry(TEFAS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: "https://www.tefas.gov.tr",
            Referer: "https://www.tefas.gov.tr/tr/fon-verileri",
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          },
          body: JSON.stringify(body),
        });
        if (!retry.ok) {
          return errorResponse(`TEFAS API yanıt vermedi (HTTP ${retry.status}).`);
        }
        json = await retry.json();
      }

      const result = extractResultList(json);

      if (result.length === 0) {
        return errorResponse(
          `'${code}' fon kodu için sonuç yok. TEFAS fon kodunu (örn. GAF) veya farklı bir arama metni deneyin.`
        );
      }

      const funds = result.map(tefasDataToFund);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: code,
                periodDays: days,
                results: funds,
                source: "TEFAS (Türkiye Elektronik Fon Alım Satım Platformu)",
                dataNote:
                  "Fiyatlar NAV (birim pay değeri) bazlıdır. Yatırım tavsiyesi değildir.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

function extractResultList(json: any): any[] {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.resultList)) return json.resultList;
  if (Array.isArray(json.result)) return json.result;
  if (Array.isArray(json.sonucListe)) return json.sonucListe;
  return [];
}

function codeHasWildcards(code: string): boolean {
  return /[%*]/.test(code);
}