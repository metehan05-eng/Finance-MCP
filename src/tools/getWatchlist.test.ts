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

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

import { registerGetWatchlist, type WatchlistDeps } from "./getWatchlist.js";
import { z } from "zod";

/**
 * Sahte MCP sunucusu: tool kaydını yakalar.
 * SDK imzası 4 veya 5 argümanlı olabilir (annotations eklenmiş olabilir),
 * bu yüzden handler her zaman son fonksiyon argümanıdır.
 */
function fakeServer() {
  const registered = new Map<string, (args: any) => Promise<any>>();
  const server = {
    tool(name: string, ...rest: unknown[]) {
      const handler = rest[rest.length - 1] as (args: any) => Promise<any>;
      registered.set(name, handler);
      return { name };
    },
    registerResource() {
      return {};
    },
  };
  return { server: server as any, registered };
}

test("semboller doğru ticker'a çözülür ve satırlar kurulur", async () => {
  const { server, registered } = fakeServer();
  const deps: WatchlistDeps = {
    resolveTickers: async (list: string[]) => new Map(list.map((s) => [s, `${s}.IS`])),
    fetchQuote: (async (t: string) => ({
      symbol: t,
      regularMarketPrice: 100,
      // GARAN daha çok yükselmiş olsun
      regularMarketChangePercent: t === "GARAN.IS" ? 3 : 1,
      currency: "TRY",
    })) as any,
  };
  registerGetWatchlist(server, deps);
  const handler = registered.get("get_watchlist")!;
  const out = await handler({ symbols: ["THYAO", "GARAN"], compact: false });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2);
  // Liste günlük performansa göre sıralanır: GARAN (%3) THYAO'dan (%1) önce gelir
  assert.deepEqual(
    data.watchlist.map((i: any) => i.symbol),
    ["GARAN", "THYAO"]
  );
  assert.equal(data.topGainer.symbol, "GARAN", "en yükselen ilk sırada olmalı");
  assert.deepEqual(data.advanceDecline, { up: 2, down: 0, unchanged: 0 });
});

test("hiç fiyat gelmezse anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  const deps: WatchlistDeps = {
    resolveTickers: async (list: string[]) => new Map(list.map((s) => [s, s])),
    fetchQuote: (async () => {
      throw new Error("network down");
    }) as any,
  };
  registerGetWatchlist(server, deps);
  const handler = registered.get("get_watchlist")!;
  const out = await handler({ symbols: ["AAA", "BBB"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /fiyat alınamadı/);
});

test("sadece biri çözülürse diğeri notFound olarak listelenir", async () => {
  const { server, registered } = fakeServer();
  const deps: WatchlistDeps = {
    resolveTickers: async (list: string[]) => new Map(list.map((s) => [s, s])),
    fetchQuote: (async (t: string) =>
      t === "GOOD" ? { symbol: t, regularMarketPrice: 5 } : undefined) as any,
  };
  registerGetWatchlist(server, deps);
  const out = await registered.get("get_watchlist")!({ symbols: ["GOOD", "BAD"] });
  const data = JSON.parse(out.content[0].text);

  assert.deepEqual(data.notFound, ["BAD"]);
  assert.equal(data.count, 2);
});

test("aynı sembol tekrarlanırsa tekilleştirilir", async () => {
  const { server, registered } = fakeServer();
  const seen: string[] = [];
  const deps: WatchlistDeps = {
    resolveTickers: async (list: string[]) => new Map(list.map((s) => [s, s])),
    fetchQuote: (async (t: string) => {
      seen.push(t);
      return { symbol: t, regularMarketPrice: 1 };
    }) as any,
  };
  registerGetWatchlist(server, deps);
  const out = await registered.get("get_watchlist")!({
    symbols: ["AAA", "AAA", "aaa", "BBB"],
  });
  const data = JSON.parse(out.content[0].text);

  // "AAA", "AAA" ve "aaa" tek semboldür (büyük/küçük harf farkı yok sayılır)
  assert.equal(data.count, 2);
  assert.deepEqual(seen, ["AAA", "BBB"]);
  assert.deepEqual(data.watchlist.map((i: any) => i.symbol).sort(), ["AAA", "BBB"]);
});

test("şema en az 1, en fazla 20 sembol ister", () => {
  assert.equal(z.array(z.string()).min(1).max(20).safeParse(["A"]).success, true);
  assert.equal(z.array(z.string()).min(1).max(20).safeParse([]).success, false);
  assert.equal(z.array(z.string()).min(1).max(20).safeParse(Array(21).fill("A")).success, false);
});

// --- Kalıcı liste yolu (sahte bağımlılıklarla) ---

/** Kalıcı liste testleri için varsayılan fiyat bağımlılıkları. */
function baseDeps(): WatchlistDeps {
  return {
    resolveTickers: async (list: string[]) => new Map(list.map((s) => [s, `${s}.IS`])),
    fetchQuote: (async (t: string) => ({
      symbol: t,
      regularMarketPrice: 100,
      regularMarketChangePercent: t === "THYAO.IS" ? 1 : 3,
    })) as any,
  };
}

test("symbols verilmezse diske kayıtlı liste okunur", async () => {
  const { server, registered } = fakeServer();
  registerGetWatchlist(server, {
    ...baseDeps(),
    load: async () => ({
      symbols: ["THYAO", "AAPL"],
      updatedAt: "2026-10-07T00:00:00.000Z",
      invalid: false,
    }),
    path: () => "/tmp/finans-watchlist.json",
  });
  const out = await registered.get("get_watchlist")!({});
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2);
  assert.deepEqual(data.watchlist.map((i: any) => i.symbol).sort(), ["AAPL", "THYAO"]);
  assert.equal(data.stored.fromFile, true);
  assert.equal(data.stored.updatedAt, "2026-10-07T00:00:00.000Z");
  assert.equal(data.stored.file, "/tmp/finans-watchlist.json");
});

test("kalıcı liste boşsa save_watchlist kullanımı istenir", async () => {
  const { server, registered } = fakeServer();
  registerGetWatchlist(server, {
    ...baseDeps(),
    load: async () => ({ symbols: [], updatedAt: null, invalid: false }),
    path: () => "/tmp/finans-watchlist.json",
  });
  const out = await registered.get("get_watchlist")!({});

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /save_watchlist/);
  assert.match(out.content[0].text, /boş/);
});

test("kalıcı liste dosyası bozuksa onarım önerilir", async () => {
  const { server, registered } = fakeServer();
  registerGetWatchlist(server, {
    ...baseDeps(),
    load: async () => ({ symbols: [], updatedAt: null, invalid: true }),
    path: () => "/tmp/finans-watchlist.json",
  });
  const out = await registered.get("get_watchlist")!({});

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /dosyası bozuk/);
  assert.match(out.content[0].text, /mode=replace/);
});

test("symbols verildiğinde kalıcı liste okunmaz", async () => {
  let loadCalled = false;
  const { server, registered } = fakeServer();
  registerGetWatchlist(server, {
    ...baseDeps(),
    load: async () => {
      loadCalled = true;
      return { symbols: ["XYZ"], updatedAt: null, invalid: false };
    },
    path: () => "/tmp/finans-watchlist.json",
  });
  const out = await registered.get("get_watchlist")!({ symbols: ["THYAO"] });
  const data = JSON.parse(out.content[0].text);

  assert.equal(loadCalled, false, "sembole erişildiyse dosya okunmamalı");
  assert.equal(data.stored, undefined);
  assert.deepEqual(
    data.watchlist.map((i: any) => i.symbol),
    ["THYAO"]
  );
});
