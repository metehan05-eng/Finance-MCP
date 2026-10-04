import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfile, clampSummary } from "./getCompanyProfile.js";

test("summaryProfile normalize edilir", () => {
  const p = normalizeProfile({
    sector: "Industrials",
    industry: "Airlines",
    country: "Turkey",
    fullTimeEmployees: 66758,
    website: "https://www.turkishairlines.com",
    longBusinessSummary: "Hava taşımacılığı",
  });
  assert.equal(p.sector, "Industrials");
  assert.equal(p.employees, 66758);
  assert.equal(p.country, "Turkey");
});

test("eksik ve boş alanlar null olur", () => {
  const p = normalizeProfile({ sector: "   ", industry: undefined, fullTimeEmployees: "çok" });
  assert.equal(p.sector, null);
  assert.equal(p.industry, null);
  assert.equal(p.employees, null);
  assert.equal(p.country, null);
  assert.equal(p.summary, null);
});

test("undefined profil çökmez", () => {
  const p = normalizeProfile(undefined);
  assert.deepEqual(p, {
    sector: null,
    industry: null,
    country: null,
    employees: null,
    website: null,
    summary: null,
  });
});

test("özet kısaltılır ve üç nokta eklenir", () => {
  assert.equal(clampSummary("kısa özet", 100), "kısa özet");
  assert.equal(clampSummary(null, 100), null);
  const long = "a".repeat(250);
  const cut = clampSummary(long, 100) as string;
  assert.equal(cut.length, 101);
  assert.ok(cut.endsWith("…"));
});
