import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInsiderTransactions,
  normalizeInsiderHolders,
  normalizeNetActivity,
  ownershipLabel,
} from "./getInsiderTransactions.js";

test("normalizeInsiderTransactions: sıralama, limit ve alan eşlemesi", () => {
  const raw = {
    transactions: [
      {
        startDate: "2024-01-01T00:00:00.000Z",
        filerName: "ESKİ KİŞİ",
        filerRelation: "Director",
        transactionText: "Sale",
        shares: 100,
        value: 1000,
        ownership: "D",
      },
      {
        startDate: new Date("2024-03-01T00:00:00.000Z"),
        filerName: "YENİ KİŞİ",
        filerRelation: "Officer",
        transactionText: "Purchase",
        shares: 200,
        value: 5000,
        ownership: "I",
      },
    ],
  };

  const rows = normalizeInsiderTransactions(raw, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].filer, "YENİ KİŞİ");
  assert.equal(rows[0].date, "2024-03-01");
  assert.equal(rows[0].ownership, "Indirect");
  assert.equal(rows[0].shares, 200);
  assert.equal(rows[0].value, 5000);
});

test("normalizeInsiderTransactions: geçersiz girdide boş liste", () => {
  assert.deepEqual(normalizeInsiderTransactions(null), []);
  assert.deepEqual(normalizeInsiderTransactions({ transactions: "x" }), []);
});

test("normalizeInsiderHolders: en büyük pozisyon önce", () => {
  const rows = normalizeInsiderHolders({
    holders: [
      { name: "A", summaryPosition: 100, relation: "Officer" },
      { name: "B", positionDirect: 500, relation: "Director" },
    ],
  });
  assert.equal(rows[0].name, "B");
  assert.equal(rows[1].name, "A");
});

test("normalizeNetActivity: oranları yüzdeye çevirir", () => {
  const activity = normalizeNetActivity({
    period: "6m",
    buyInfoCount: 2,
    buyInfoShares: 100,
    sellInfoCount: 1,
    sellInfoShares: 50,
    netInfoCount: 3,
    netInfoShares: 50,
    netPercentInsiderShares: 0.004,
    totalInsiderShares: 1000,
    netInstSharesBuying: -200,
    netInstBuyingPercent: -0.14,
  });

  assert.ok(activity);
  assert.equal(activity.period, "6m");
  assert.equal(activity.netShares, 50);
  assert.equal(activity.netPercentInsiderSharesPct! / 100, 0.004);
  assert.equal(activity.netInstitutionalBuyingPct! / 100, -0.14);
  assert.equal(normalizeNetActivity(null), null);
});

test("ownershipLabel: D/I kodlarını çözer", () => {
  assert.equal(ownershipLabel("D"), "Direct");
  assert.equal(ownershipLabel("I"), "Indirect");
  assert.equal(ownershipLabel("Other"), "Other");
  assert.equal(ownershipLabel(null), null);
});
