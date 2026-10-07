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
  assert.equal(clampSummary("özet", 0), null, "0 sınırı özeti gizlemeli");
  const long = "a".repeat(250);
  const cut = clampSummary(long, 100) as string;
  assert.equal(cut.length, 101);
  assert.ok(cut.endsWith("…"));
});

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

import { registerGetCompanyProfile, type ProfileDeps } from "./getCompanyProfile.js";

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

test("normalize edilmiş profil döner", async () => {
  const { server, registered } = fakeServer();
  const deps: ProfileDeps = {
    resolveTickers: (async (list: string[]) => new Map(list.map((s) => [s, `${s}.IS`]))) as any,
    fetchQuoteSummary: (async () => ({
      summaryProfile: {
        sector: "Financial Services",
        industry: "Banks - Regional",
        country: "Turkey",
        fullTimeEmployees: 42000,
        website: "https://garanti.com.tr",
        longBusinessSummary: "x".repeat(900),
      },
      price: { longName: "Garanti Bankasi", currency: "TRY", exchangeName: "IST" },
    })) as any,
  };
  registerGetCompanyProfile(server, deps);
  const out = await registered.get("get_company_profile")!({ symbol: "GARAN", summaryLength: 100 });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.symbol, "GARAN.IS");
  assert.equal(data.sector, "Financial Services");
  assert.equal(data.employees, 42000);
  assert.equal(data.summary.length, 101, "özet summaryLength ile kırpılmalı");
});

test("summaryLength 0 ise özet gizlenir", async () => {
  const { server, registered } = fakeServer();
  registerGetCompanyProfile(server, {
    resolveTickers: (async (list: string[]) => new Map(list.map((s) => [s, s]))) as any,
    fetchQuoteSummary: (async () => ({
      summaryProfile: { sector: "Tech", longBusinessSummary: "uzun özet" },
      price: {},
    })) as any,
  });
  const out = await registered.get("get_company_profile")!({ symbol: "AAPL", summaryLength: 0 });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.summary, null);
  assert.equal(data.sector, "Tech");
});

test("profil alanları boşsa anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  registerGetCompanyProfile(server, {
    resolveTickers: (async (list: string[]) => new Map(list.map((s) => [s, s]))) as any,
    fetchQuoteSummary: (async () => ({ summaryProfile: {}, price: {} })) as any,
  });
  const out = await registered.get("get_company_profile")!({ symbol: "ZZZZ" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /profil verisi eksik/);
});

test("ağ hatası yakalanır ve sadece hata metni döner", async () => {
  const { server, registered } = fakeServer();
  registerGetCompanyProfile(server, {
    resolveTickers: (async () => {
      throw new Error("ETIMEDOUT");
    }) as any,
    fetchQuoteSummary: (async () => ({})) as any,
  });
  const out = await registered.get("get_company_profile")!({ symbol: "AAPL" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /ETIMEDOUT/);
});
