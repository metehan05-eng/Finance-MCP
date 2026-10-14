import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => tagName === "Currency",
});

export interface TcmbCurrency {
  code: string;
  unit: number;
  currencyName: string;
  forexBuying: number | null;
  forexSelling: number | null;
  banknoteBuying: number | null;
  banknoteSelling: number | null;
}

export interface TcmbData {
  date: string;
  bulletinNo: string;
  currencies: TcmbCurrency[];
}

/**
 * TCMB XML verisini (today.xml veya arşiv) parse eder.
 * Beklenmeyen gövde (HTML hata sayfası, şema değişikliği) için açıklayıcı hata fırlatır.
 */
export function parseTcmbXml(xmlText: string): TcmbData {
  const parsed: any = parser.parse(xmlText);
  const root = parsed?.["Tarih_Date"];

  if (!root || typeof root !== "object") {
    throw new Error("TCMB XML biçimi tanınmadı (Tarih_Date kökü yok).");
  }

  const date: string = root["@_Date"] ?? root["@_Tarih"] ?? "";
  const bulletinNo: string = root["@_Bulten_No"] ?? "";

  const currencyNode = root["Currency"];
  const rawCurrencies: any[] = Array.isArray(currencyNode)
    ? currencyNode
    : currencyNode
      ? [currencyNode]
      : [];

  const currencies: TcmbCurrency[] = rawCurrencies
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      code: c["@_CurrencyCode"] ?? "",
      unit: Number(c["Unit"]) || 1,
      currencyName: c["CurrencyName"] ?? "",
      forexBuying: toNumber(c["ForexBuying"]),
      forexSelling: toNumber(c["ForexSelling"]),
      banknoteBuying: toNumber(c["BanknoteBuying"]),
      banknoteSelling: toNumber(c["BanknoteSelling"]),
    }));

  return { date, bulletinNo, currencies };
}

function toNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(String(val).replace(",", "."));
  return isNaN(n) ? null : n;
}
