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
