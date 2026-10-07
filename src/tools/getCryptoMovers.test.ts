import test from "node:test";
import assert from "node:assert/strict";
import {
  registerGetCryptoMovers,
  parseMover,
  sortByChange,
  filterByMinCap,
  withChange,
  type Mover,
  type MoverDeps,
} from "./getCryptoMovers.js";

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

const raw = [
  {
    symbol: "btc",
    name: "Bitcoin",
    market_cap_rank: 1,
    current_price: 100000,
    price_change_percentage_24h: 1.5,
    price_change_percentage_7d_in_currency: 4,
    market_cap: 2e12,
    total_volume: 3e10,
  },
  {
    symbol: "eth",
    name: "Ethereum",
    market_cap_rank: 2,
    current_price: 4000,
    price_change_percentage_24h: -2.5,
    price_change_percentage_7d_in_currency: -8,
    market_cap: 4e11,
    total_volume: 2e10,
  },
  {
    symbol: "sol",
    name: "Solana",
    market_cap_rank: 5,
    current_price: 200,
    price_change_percentage_24h: 9.75,
    price_change_percentage_7d_in_currency: 12,
    market_cap: 1e10,
    total_volume: 5e9,
  },
  {
    symbol: "tiny",
    name: "Tiny",
    market_cap_rank: 200,
    current_price: 0.01,
    price_change_percentage_24h: 88,
    price_change_percentage_7d_in_currency: 300,
    market_cap: 5e6,
    total_volume: 1e5,
  },
];

const deps = (rows: unknown[] = raw): MoverDeps => ({ fetchJson: async () => rows });

test("parseMover alanları normalize eder, sembol büyük harf olur", () => {
  const m = parseMover(raw[0]);
  assert.equal(m.symbol, "BTC");
  assert.equal(m.priceUsd, 100000);
  assert.equal(m.change24hPct, 1.5);
  assert.equal(m.change7dPct, 4);
  assert.equal(m.rank, 1);
  assert.equal(m.volume24hUsd, 3e10);
});

test("parseMover eksik alanlarda null ve güvenli varsayılan üretir", () => {
  const m = parseMover({});
  assert.equal(m.symbol, "?");
  assert.equal(m.rank, null);
  assert.equal(m.priceUsd, null);
  assert.equal(m.change24hPct, null);
  assert.equal(m.change7dPct, null);
});

test("sortByChange en yüksekten en düşüğe sıralar, limit uygular", () => {
  const rows = raw.map(parseMover);
  assert.deepEqual(
    sortByChange(rows, "change24hPct", 2).map((m) => m.symbol),
    ["TINY", "SOL"]
  );
});

test("sortByChange negatif limit en düşükleri en kötüden döner", () => {
  const rows = raw.map(parseMover);
  assert.deepEqual(
    sortByChange(rows, "change24hPct", -2).map((m) => m.symbol),
    ["ETH", "BTC"]
  );
});

test("7d penceresi 7 günlük değişimi kullanır", () => {
  const rows = raw.map(parseMover);
  assert.deepEqual(
    sortByChange(rows, "change7dPct", 1).map((m) => m.symbol),
    ["TINY"]
  );
});

test("sortByChange girdi dizisini mutasyona uğratmaz", () => {
  const rows = raw.map(parseMover);
  const before = rows.map((m) => m.symbol);
  sortByChange(rows, "change24hPct", 1);
  assert.deepEqual(
    rows.map((m) => m.symbol),
    before
  );
});

test("sortByChange null değişimleri sona iter (Infinity koruması)", () => {
  const rows: Mover[] = [
    {
      rank: 1,
      symbol: "A",
      name: "A",
      priceUsd: 1,
      change24hPct: null,
      change7dPct: null,
      marketCapUsd: 1,
      volume24hUsd: 1,
    },
    {
      rank: 2,
      symbol: "B",
      name: "B",
      priceUsd: 1,
      change24hPct: 5,
      change7dPct: null,
      marketCapUsd: 1,
      volume24hUsd: 1,
    },
  ];
  assert.deepEqual(
    sortByChange(rows, "change24hPct", 2).map((m) => m.symbol),
    ["B", "A"]
  );
});

test("filterByMinCap küçük coinleri eler, 0 filtrelemez", () => {
  const rows = raw.map(parseMover);
  assert.deepEqual(filterByMinCap(rows, 0).length, 4);
  // SOL 10 milyar $ ile eşik üstünde; yalnızca 5 milyon $'lık tiny elenir
  assert.deepEqual(
    filterByMinCap(rows, 1e9).map((m) => m.symbol),
    ["BTC", "ETH", "SOL"]
  );
});

test("withChange null değişimli kayıtları eler", () => {
  const rows: Mover[] = [
    {
      rank: 1,
      symbol: "A",
      name: "A",
      priceUsd: 1,
      change24hPct: 1,
      change7dPct: null,
      marketCapUsd: 1,
      volume24hUsd: 1,
    },
    {
      rank: 2,
      symbol: "B",
      name: "B",
      priceUsd: 1,
      change24hPct: null,
      change7dPct: null,
      marketCapUsd: 1,
      volume24hUsd: 1,
    },
  ];
  assert.deepEqual(
    withChange(rows, "change24hPct").map((m) => m.symbol),
    ["A"]
  );
  assert.deepEqual(withChange(rows, "change7dPct"), []);
});

test("varsayılan 24h penceresinde yükselen ve düşen listeler döner", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, deps());
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 2,
    minMarketCapUsd: 0,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.window, "24h");
  assert.equal(data.gainers[0].symbol, "TINY");
  assert.equal(data.losers[0].symbol, "ETH");
  assert.equal(data.gainers.length, 2);
  assert.equal(data.losers.length, 2);
  assert.equal(data.universeSize, 4);
  assert.equal(data.eligibleCount, 4);
});

test("minMarketCapUsd filtresi sonuç kümesini daraltır", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, deps());
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 1,
    minMarketCapUsd: 1e9,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.eligibleCount, 3);
  assert.deepEqual(
    data.gainers.map((m: any) => m.symbol),
    ["SOL"]
  );
  assert.deepEqual(
    data.losers.map((m: any) => m.symbol),
    ["ETH"]
  );
});

test("medyan değişim piyasa ortalamasını verir", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, deps());
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 3,
    minMarketCapUsd: 0,
  });
  const data = JSON.parse(out.content[0].text);

  // 1.5, -2.5, 9.75, 88 -> medyan 9.75
  assert.equal(data.marketMedianChangePct, 9.75);
});

test("boş yanıt anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, deps([]));
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 5,
    minMarketCapUsd: 0,
  });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /boş yanıt/);
});

test("filtreye uyan coin kalmazsa hata döner", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, deps());
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 5,
    minMarketCapUsd: 1e15,
  });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /uyan ve hareket verisi olan coin kalmadı/);
});

test("HTTP hatası mesaja yansır ve yeniden deneme ipucu verilir", async () => {
  const { server, registered } = fakeServer();
  registerGetCryptoMovers(server, {
    fetchJson: async () => {
      throw new Error("HTTP 429");
    },
  });
  const out = await registered.get("get_crypto_movers")!({
    window: "24h",
    limit: 5,
    minMarketCapUsd: 0,
  });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /HTTP 429/);
  assert.match(out.content[0].text, /sınırlı istek/);
});
