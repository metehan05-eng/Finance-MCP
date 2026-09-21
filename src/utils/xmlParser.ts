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
 */
export function parseTcmbXml(xmlText: string): TcmbData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = parser.parse(xmlText);
  const root = parsed["Tarih_Date"];

  const date: string = root["@_Date"] ?? root["@_Tarih"] ?? "";
  const bulletinNo: string = root["@_Bulten_No"] ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCurrencies: any[] = Array.isArray(root["Currency"])
    ? root["Currency"]
    : [root["Currency"]];

  const currencies: TcmbCurrency[] = rawCurrencies.map((c) => ({
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
