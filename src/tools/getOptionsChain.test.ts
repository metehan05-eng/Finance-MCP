import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContract,
  nearestStrike,
  summarizeChain,
  chainDate,
  pickChain,
} from "./getOptionsChain.js";

test("normalizeContract: IV'yi yüzdeye çevirir", () => {
  const c = normalizeContract({
    contractSymbol: "AAPL260101C00150000",
    strike: 150,
    lastPrice: 5,
    bid: 4.9,
    ask: 5.1,
    volume: 100,
    openInterest: 250,
    impliedVolatility: 0.35,
    inTheMoney: true,
  });

  assert.equal(c.strike, 150);
  assert.equal(c.impliedVolatilityPct, 35);
  assert.equal(c.openInterest, 250);
  assert.equal(c.inTheMoney, true);
});

test("normalizeContract: eksik alanlar null", () => {
  const c = normalizeContract({});
  assert.equal(c.strike, null);
  assert.equal(c.impliedVolatilityPct, null);
  assert.equal(c.inTheMoney, null);
});

test("nearestStrike: fiyata en yakın kontratı seçer", () => {
  const contracts = [
    normalizeContract({ strike: 140 }),
    normalizeContract({ strike: 150 }),
    normalizeContract({ strike: 155 }),
  ];
  assert.equal(nearestStrike(contracts, 149)?.strike, 150);
  assert.equal(nearestStrike(contracts, 153)?.strike, 155);
  assert.equal(nearestStrike(contracts, null), null);
  assert.equal(nearestStrike([], 100), null);
});

test("summarizeChain: toplamlar, ITM sayısı ve likidite sıralaması", () => {
  const summary = summarizeChain(
    [
      { strike: 100, openInterest: 10, volume: 2, impliedVolatility: 0.2, inTheMoney: true },
      { strike: 110, openInterest: 50, volume: 5, impliedVolatility: 0.3, inTheMoney: false },
      { strike: 90, openInterest: 30, volume: 1, impliedVolatility: 0.25, inTheMoney: true },
    ],
    102,
    2
  );

  assert.equal(summary.contractCount, 3);
  assert.equal(summary.totalOpenInterest, 90);
  assert.equal(summary.totalVolume, 8);
  assert.equal(summary.itmCount, 2);
  assert.equal(summary.atm?.strike, 100);
  assert.deepEqual(
    summary.topByOpenInterest.map((c) => c.strike),
    [110, 90]
  );
});

test("chainDate / pickChain: vade seçimi", () => {
  const chains = [
    { expirationDate: "2026-11-06T00:00:00.000Z" },
    { expirationDate: new Date("2026-11-13T00:00:00.000Z") },
  ];
  assert.equal(chainDate(chains[0]), "2026-11-06");
  assert.equal(pickChain(chains)?.expirationDate, chains[0].expirationDate);
  assert.equal(pickChain(chains, "2026-11-13"), chains[1]);
  assert.equal(pickChain(chains, "2027-01-01"), null);
  assert.equal(pickChain([], "2026-11-06"), null);
});
