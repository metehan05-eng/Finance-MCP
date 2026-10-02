import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate } from "./getEarningsInfo.js";

test("normalizeDate: ISO string", () => {
  assert.equal(normalizeDate("2026-10-29T20:00:00.000Z"), "2026-10-29T20:00:00.000Z");
});

test("normalizeDate: Date nesnesi", () => {
  const d = new Date("2026-10-29T20:00:00.000Z");
  assert.equal(normalizeDate(d), d.toISOString());
});

test("normalizeDate: { raw, fmt } biçimi (bazı borsalar)", () => {
  assert.equal(
    normalizeDate({ raw: "2026-11-04T15:00:00.000Z", fmt: "4 Kas 2026" }),
    "2026-11-04T15:00:00.000Z"
  );
});

test("normalizeDate: sayısal zaman damgası (saniye ve ms)", () => {
  const sec = Math.floor(new Date("2026-10-29T20:00:00.000Z").getTime() / 1000);
  assert.equal(normalizeDate(sec), "2026-10-29T20:00:00.000Z");
  assert.equal(normalizeDate(sec * 1000), "2026-10-29T20:00:00.000Z");
});

test("normalizeDate: null / bozuk değerler", () => {
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(undefined), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("gecersiz tarih"), null);
  assert.equal(normalizeDate({}), null);
  assert.equal(normalizeDate({ raw: null }), null);
});
