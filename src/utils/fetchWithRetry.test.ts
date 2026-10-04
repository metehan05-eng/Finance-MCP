import test from "node:test";
import assert from "node:assert/strict";
import { resolveTtl } from "./fetchWithRetry.js";

test("kaynak bazlı TTL'ler uygulanır", () => {
  assert.equal(resolveTtl("https://api.coingecko.com/api/v3/ping"), 60);
  assert.equal(resolveTtl("https://www.tcmb.gov.tr/wps/faiz"), 1800);
  assert.equal(resolveTtl("https://api.worldbank.org/v2/country/TUR"), 3600);
  assert.equal(resolveTtl("https://www.tefas.gov.tr/api/funds/x"), 300);
});

test("bilinmeyen kaynak varsayılan TTL'yi alır", () => {
  assert.equal(resolveTtl("https://bilinmeyen.example.com/x"), 300);
});

test("geçersiz URL çökmez", () => {
  assert.equal(resolveTtl("gibi bir url"), 300);
  assert.equal(resolveTtl(""), 300);
});

test("önbellekten dönen gövde ikinci çağrıda da okunabilir", async () => {
  const { cacheClear } = await import("./cache.js");
  const { fetchWithRetry } = await import("./fetchWithRetry.js");
  cacheClear();

  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const first = await fetchWithRetry("https://cache-test.example.com/a");
    const second = await fetchWithRetry("https://cache-test.example.com/a");

    assert.equal(await first.text(), '{"ok":true}');
    assert.equal(await second.text(), '{"ok":true}', "önbellekten gelen gövde tekrar okunabilmeli");
    assert.equal(calls, 1, "ikinci istek ağa gitmemeli");
  } finally {
    globalThis.fetch = original;
    cacheClear();
  }
});

test("her çağrı ayrı Response nesnesi döner", async () => {
  const { cacheClear } = await import("./cache.js");
  const { fetchWithRetry } = await import("./fetchWithRetry.js");
  cacheClear();

  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("x", { status: 200 })) as typeof fetch;

  try {
    const a = await fetchWithRetry("https://cache-test.example.com/b");
    const b = await fetchWithRetry("https://cache-test.example.com/b");
    assert.notEqual(a, b, "aynı Response örneği paylaşılmamalı");
    assert.equal(a.bodyUsed, false);
  } finally {
    globalThis.fetch = original;
    cacheClear();
  }
});

test("önbellek TTL'si kaynağa göre uygulanır", async () => {
  const { cacheClear, cacheStats } = await import("./cache.js");
  const { fetchWithRetry } = await import("./fetchWithRetry.js");
  cacheClear();

  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("y", { status: 200 })) as typeof fetch;

  try {
    await fetchWithRetry("https://api.coingecko.com/api/v3/ping");
    const stats = cacheStats();
    assert.equal(stats.entries, 1);
    assert.equal(stats.fresh, 1);
  } finally {
    globalThis.fetch = original;
    cacheClear();
  }
});
