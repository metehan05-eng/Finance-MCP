import test from "node:test";
import assert from "node:assert/strict";
import {
  periodsPerYear,
  commonDates,
  registerBacktestPortfolio,
  type BacktestDeps,
} from "./backtestPortfolio.js";

test("periodsPerYear: günlük 252, haftalık 52", () => {
  assert.equal(periodsPerYear("1d"), 252);
  assert.equal(periodsPerYear("1wk"), 52);
});

test("commonDates: serilerin ortak günlerini döndürür", () => {
  const a = new Map([
    ["2024-01-01", 1],
    ["2024-01-02", 2],
    ["2024-01-03", 3],
  ]);
  const b = new Map([
    ["2024-01-02", 20],
    ["2024-01-03", 30],
    ["2024-01-04", 40],
  ]);
  assert.deepEqual(commonDates([a, b]).sort(), ["2024-01-02", "2024-01-03"]);
});

test("commonDates: kesişim boşalınca sıfırlanmaz (kritik regresyon)", () => {
  const a = new Map([
    ["2024-01-01", 1],
    ["2024-01-02", 2],
  ]);
  const b = new Map([["2024-02-01", 3]]);
  const c = new Map([["2024-03-01", 4]]);
  // a∩b boş; eski hata son seriyle sıfırlayıp [2024-03-01] döndürüyordu.
  assert.deepEqual(commonDates([a, b, c]), []);
});

test("commonDates: tek seri ve boş girdi", () => {
  const a = new Map([["2024-01-01", 1]]);
  assert.deepEqual(commonDates([a]).sort(), ["2024-01-01"]);
  assert.deepEqual(commonDates([]), []);
});

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

function fakeServer() {
  const registered = new Map<string, (args: any) => Promise<any>>();
  const server = {
    tool(name: string, ...rest: unknown[]) {
      registered.set(name, rest[rest.length - 1] as (args: any) => Promise<any>);
      return { name };
    },
  };
  return { server: server as any, registered };
}

const DATES = Array.from({ length: 15 }, (_, i) => `2024-01-${String(i + 1).padStart(2, "0")}`);
const linearChart = (symbol: string, start: number, step: number) => ({
  symbol,
  currency: "USD",
  rows: DATES.map((d, i) => ({ date: `${d}T00:00:00.000Z`, close: start + i * step })),
});

function backtestDeps(charts: Record<string, unknown>): BacktestDeps {
  return {
    tryBoth: (async (symbol: string) => {
      const c = charts[symbol];
      if (!c) throw new Error(`veri yok: ${symbol}`);
      return c;
    }) as any,
    fetchOhlc: (async () => ({ symbol: "USDTRY=X", currency: "TRY", rows: [] })) as any,
  };
}

test("backtest: metrikler ve katkılar hesaplanır", async () => {
  const { server, registered } = fakeServer();
  registerBacktestPortfolio(
    server,
    backtestDeps({ AAPL: linearChart("AAPL", 100, 1), MSFT: linearChart("MSFT", 200, 2) })
  );

  const out = await registered.get("backtest_portfolio")!({
    positions: [
      { symbol: "AAPL", quantity: 1 },
      { symbol: "MSFT", quantity: 1 },
    ],
    period: "1mo",
    interval: "1d",
    riskFreeRate: 2,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.dataPoints, 15);
  assert.equal(data.startDate, "2024-01-01");
  assert.equal(data.endDate, "2024-01-15");
  assert.equal(data.contributions.length, 2);
  assert.equal(data.failedSymbols.length, 0);
  assert.ok(data.metricsUsd.totalReturn > 0, "yükselen seride getiri pozitif olmalı");
  assert.ok(typeof data.metricsUsd.volatility === "number");
  assert.ok(data.metricsUsd.maxDrawdown <= 0);
});

test("backtest: hiçbir sembolden veri alınamazsa hata döner", async () => {
  const { server, registered } = fakeServer();
  registerBacktestPortfolio(server, backtestDeps({}));

  const out = await registered.get("backtest_portfolio")!({
    positions: [{ symbol: "YOK", quantity: 1 }],
    period: "1mo",
    interval: "1d",
  });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /veri alınamadı/);
});

test("backtest: ortak veri 10 günden azsa anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  const short = {
    symbol: "X",
    currency: "USD",
    rows: DATES.slice(0, 5).map((d) => ({ date: `${d}T00:00:00.000Z`, close: 1 })),
  };
  registerBacktestPortfolio(server, backtestDeps({ AAPL: linearChart("AAPL", 1, 1), X: short }));

  const out = await registered.get("backtest_portfolio")!({
    positions: [
      { symbol: "AAPL", quantity: 1 },
      { symbol: "X", quantity: 1 },
    ],
    period: "1mo",
    interval: "1d",
  });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /Yeterli ortak veri/);
});
