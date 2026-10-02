import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeConsensus, consensusLabel } from "./getAnalystConsensus.js";

test("summarizeConsensus: sayıları toplar ve yükseliş yüzdesi hesaplar", () => {
  const rows = summarizeConsensus([
    { period: "0m", strongBuy: 3, buy: 8, hold: 2, sell: 0, strongSell: 0 },
  ]);
  assert.equal(rows[0].total, 13);
  assert.equal(rows[0].bullishPercent, 84.62);
});

test("summarizeConsensus: eksik alanlar 0 sayılır", () => {
  const rows = summarizeConsensus([{ period: "-1m", buy: 1 }]);
  assert.equal(rows[0].total, 1);
  assert.equal(rows[0].hold, 0);
  assert.equal(rows[0].bullishPercent, 100);
});

test("summarizeConsensus: analist yoksa yüzde null", () => {
  const rows = summarizeConsensus([{ period: "0m" }]);
  assert.equal(rows[0].total, 0);
  assert.equal(rows[0].bullishPercent, null);
});

test("consensusLabel: yükseliş yüzdesine göre yorum", () => {
  const mk = (p: number) => ({ bullishPercent: p }) as any;
  assert.match(consensusLabel(mk(90))!, /güçlü alış/);
  assert.match(consensusLabel(mk(65))!, /alış ağırlıklı/);
  assert.match(consensusLabel(mk(50))!, /kararsız/);
  assert.match(consensusLabel(mk(30))!, /satış ağırlıklı/);
  assert.match(consensusLabel(mk(10))!, /güçlü satış/);
  assert.equal(consensusLabel(undefined), null);
  assert.equal(
    consensusLabel(mk(50) as any) && consensusLabel({ bullishPercent: null } as any),
    null
  );
});
