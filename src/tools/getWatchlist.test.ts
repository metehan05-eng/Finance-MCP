import test from "node:test";
import assert from "node:assert/strict";
import { buildWatchItem, rankByDay } from "./getWatchlist.js";

test("izleme satırı kotasyondan üretilir", () => {
  const item = buildWatchItem("AAPL", {
    regularMarketPrice: 262.5,
    regularMarketChangePercent: -1.1,
    fiftyTwoWeekChangePercent: 18.4,
    currency: "USD",
    fiftyTwoWeekHigh: 300,
    shortName: "Apple Inc.",
  });
  assert.equal(item.price, 262.5);
  assert.equal(item.dayChangePercent, -1.1);
  assert.equal(item.week52ChangePercent, 18.4);
  assert.equal(item.distanceTo52High, -12.5);
  assert.equal(item.currency, "USD");
});

test("eksik kotasyon null alanlar üretir", () => {
  const item = buildWatchItem("ZZZZ", undefined);
  assert.equal(item.price, null);
  assert.equal(item.dayChangePercent, null);
  assert.equal(item.name, null);
});

test("52 hafta yükseği yoksa uzaklık null", () => {
  const item = buildWatchItem("X", { regularMarketPrice: 10 });
  assert.equal(item.distanceTo52High, null);
});

test("sıralama günlük performansa göre", () => {
  const items = [
    buildWatchItem("A", { regularMarketPrice: 1, regularMarketChangePercent: -2 }),
    buildWatchItem("B", { regularMarketPrice: 1, regularMarketChangePercent: 5 }),
    buildWatchItem("C", { regularMarketPrice: 1, regularMarketChangePercent: 0.5 }),
  ];
  assert.deepEqual(
    rankByDay(items).map((i) => i.symbol),
    ["B", "C", "A"]
  );
});

test("veri yoksa en sonda durur, girdi bozulmaz", () => {
  const items = [
    buildWatchItem("A", undefined),
    buildWatchItem("B", { regularMarketPrice: 1, regularMarketChangePercent: 1 }),
  ];
  const ranked = rankByDay(items);
  assert.deepEqual(
    ranked.map((i) => i.symbol),
    ["B", "A"]
  );
  assert.deepEqual(
    items.map((i) => i.symbol),
    ["A", "B"]
  );
});
