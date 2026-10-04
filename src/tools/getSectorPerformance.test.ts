import test from "node:test";
import assert from "node:assert/strict";
import { periodReturn, bestSector, SECTOR_ETFS } from "./getSectorPerformance.js";

test("dönem getirisi yüzde hesaplanır", () => {
  assert.equal(periodReturn([100, 110]), 10);
  assert.equal(periodReturn([100, 90]), -10);
  assert.equal(periodReturn([50, 100]), 100);
});

test("null ve sıfır kapanışlar atlanır", () => {
  assert.equal(periodReturn([100, null, 0, 120]), 20);
});

test("yetersiz veri null döner", () => {
  assert.equal(periodReturn([]), null);
  assert.equal(periodReturn([100]), null);
  assert.equal(periodReturn([null, null]), null);
  assert.equal(periodReturn([0, 100]), null);
});

test("en güçlü sektör seçilir (null yok sayılır)", () => {
  const rows = [
    { symbol: "XLK", sector: "Teknoloji", periodReturn: 3, bars: 10 },
    { symbol: "XLF", sector: "Finans", periodReturn: 8, bars: 10 },
    { symbol: "XLE", sector: "Enerji", periodReturn: null, bars: 0 },
  ];
  assert.equal(bestSector(rows)?.sector, "Finans");
});

test("veri yoksa null döner", () => {
  assert.equal(
    bestSector([{ symbol: "XLK", sector: "Teknoloji", periodReturn: null, bars: 0 }]),
    null
  );
});

test("11 sektör ETF tanımlı ve semboller benzersiz", () => {
  assert.equal(SECTOR_ETFS.length, 11);
  const symbols = SECTOR_ETFS.map((s) => s.symbol);
  assert.equal(new Set(symbols).size, 11);
  assert.ok(symbols.includes("XLK") && symbols.includes("XLF") && symbols.includes("XLE"));
});
