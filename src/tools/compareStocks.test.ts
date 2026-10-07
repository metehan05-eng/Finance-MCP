import test from "node:test";
import assert from "node:assert/strict";
import { buildRow, sortByKey, type ComparisonRow } from "./compareStocks.js";

test("fiyat ve değişim satıra yazılır", () => {
  const row = buildRow("AAPL", { regularMarketPrice: 262.5, regularMarketChangePercent: 1.2 }, {});
  assert.equal(row.symbol, "AAPL");
  assert.equal(row.price, 262.5);
  assert.equal(row.changePercent, 1.2);
});

test("piyasa değeri milyar birime çevrilir", () => {
  const row = buildRow(
    "AAPL",
    { regularMarketPrice: 100 },
    { defaultKeyStatistics: { marketCap: 4_100_000_000_000 } }
  );
  assert.equal(row.marketCap, 4100);
});

test("52 hafta yükseğe uzaklık yüzde hesaplanır", () => {
  const row = buildRow(
    "X",
    { regularMarketPrice: 90, fiftyTwoWeekHigh: 100 },
    { summaryDetail: { fiftyTwoWeekHigh: 100 } }
  );
  assert.equal(row.distanceTo52High, -10);
});

test("eksik alanlar null (BIST'te F/K gelmeyebilir)", () => {
  const row = buildRow("THYAO.IS", { regularMarketPrice: 300 }, {});
  assert.equal(row.trailingPE, null);
  assert.equal(row.priceToBook, null);
  assert.equal(row.returnOnEquity, null);
  assert.equal(row.marketCap, null);
  assert.equal(row.beta, null);
});

test("ROE ve temettü verimi yüzdeye çevrilir", () => {
  const row = buildRow(
    "AAPL",
    {},
    {
      financialData: { returnOnEquity: 1.4875101 },
      summaryDetail: { dividendYield: 0.0051 },
    }
  );
  assert.equal(row.returnOnEquity, 148.75);
  assert.equal(row.dividendYield, 0.51);
});

test("sıralamada null değerler her zaman sona gider", () => {
  const rows: ComparisonRow[] = [
    { ...buildRow("A", {}, {}), price: null },
    { ...buildRow("B", {}, {}), price: 5 },
    { ...buildRow("C", {}, {}), price: 900 },
  ];
  const desc = sortByKey(rows, "price", "desc").map((r) => r.symbol);
  assert.deepEqual(desc, ["C", "B", "A"]);

  const asc = sortByKey(rows, "price", "asc").map((r) => r.symbol);
  assert.deepEqual(asc, ["B", "C", "A"]);
});

test("sıralama girdi dizisini mutasyona uğratmaz", () => {
  const rows: ComparisonRow[] = [
    { ...buildRow("A", {}, {}), price: 1 },
    { ...buildRow("B", {}, {}), price: 9 },
  ];
  sortByKey(rows, "price", "desc");
  assert.deepEqual(
    rows.map((r) => r.symbol),
    ["A", "B"]
  );
});

test("tüm null ise sıralama kararlı kalır", () => {
  const rows: ComparisonRow[] = [{ ...buildRow("A", {}, {}) }, { ...buildRow("B", {}, {}) }];
  assert.equal(sortByKey(rows, "trailingPE", "desc").length, 2);
});

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

import { registerCompareStocks, type CompareDeps } from "./compareStocks.js";

function fakeServer() {
  const registered = new Map<string, (args: any) => Promise<any>>();
  const server = {
    tool(name: string, ...rest: unknown[]) {
      registered.set(name, rest[rest.length - 1] as (args: any) => Promise<any>);
      return { name };
    },
    registerResource() {
      return {};
    },
  };
  return { server: server as any, registered };
}

const quotes: Record<string, any> = {
  AAPL: { symbol: "AAPL", regularMarketPrice: 300, regularMarketChangePercent: 1 },
  "THYAO.IS": { symbol: "THYAO.IS", regularMarketPrice: 100, regularMarketChangePercent: 2 },
};

const summaries: Record<string, any> = {
  AAPL: { defaultKeyStatistics: { marketCap: 4_500_000_000_000, priceToBook: 45 } },
  "THYAO.IS": { summaryDetail: { fiftyTwoWeekHigh: 120 } },
};

function deps(overrides: Partial<CompareDeps> = {}): CompareDeps {
  return {
    resolveTickers: (async (list: string[]) =>
      new Map(list.map((s) => [s, s + (s === "THYAO" ? ".IS" : "")]))) as any,
    fetchQuote: (async (t: string) => quotes[t]) as any,
    fetchQuoteSummary: (async (t: string) => summaries[t] ?? {}) as any,
    ...overrides,
  };
}

test("semboller karşılaştırma tablosuna dönüşür", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(server, deps());
  const out = await registered.get("compare_stocks")!({
    symbols: ["THYAO", "AAPL"],
    sortBy: "marketCap",
    order: "desc",
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2);
  assert.equal(data.comparison[0].symbol, "AAPL", "piyasa değeri büyük olan önce");
  assert.equal(data.comparison[0].marketCap, 4500);
  assert.equal(data.comparison[1].distanceTo52High, -16.67);
});

test("leader seçilen ölçüte göre belirlenir", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(server, deps());
  const out = await registered.get("compare_stocks")!({
    symbols: ["THYAO", "AAPL"],
    sortBy: "changePercent",
    order: "desc",
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.leader.symbol, "THYAO.IS");
  assert.equal(data.leader.changePercent, 2);
});

test("en az 2 sembol şartı", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(server, deps());
  const out = await registered.get("compare_stocks")!({ symbols: ["AAPL"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /En az 2/);
});

test("hiç fiyat gelmezse anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(
    server,
    deps({
      resolveTickers: (async (list: string[]) => new Map(list.map((s) => [s, s]))) as any,
      fetchQuote: (async () => undefined) as any,
    })
  );
  const out = await registered.get("compare_stocks")!({ symbols: ["AAA", "BBB"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /fiyat alınamadı/);
});

test("quoteSummary hatası tabloyu bozmaz (null alanlar)", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(
    server,
    deps({
      fetchQuoteSummary: (async () => {
        throw new Error("schema error");
      }) as any,
    })
  );
  const out = await registered.get("compare_stocks")!({ symbols: ["THYAO", "AAPL"] });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2);
  assert.equal(
    data.comparison.every((r: any) => r.trailingPE === null),
    true
  );
  assert.equal(
    data.comparison.some((r: any) => r.price !== null),
    true
  );
});

test("aynı sembol farklı yazımla verilirse tekilleştirilir", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(server, deps());
  const out = await registered.get("compare_stocks")!({
    symbols: ["AAPL", "aapl", "THYAO"],
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2, "AAPL ve aapl tek sembol sayılmalı");
});

test("tekilleştirme sonrası 2'den az sembol kalırsa hata döner", async () => {
  const { server, registered } = fakeServer();
  registerCompareStocks(server, deps());
  const out = await registered.get("compare_stocks")!({ symbols: ["AAPL", "aapl"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /En az 2/);
});
