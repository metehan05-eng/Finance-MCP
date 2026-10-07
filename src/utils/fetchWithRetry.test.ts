import test from "node:test";
import assert from "node:assert/strict";
import { resolveTtl, fetchWithRetry } from "./fetchWithRetry.js";
import { breakerReset, breakerStatus, isBreakerOpen } from "./httpCircuit.js";
import { cacheClear } from "./cache.js";

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
  const { cacheStats } = await import("./cache.js");
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

/** Programlanabilir sahte fetch: her çağrıda sıradaki yanıtı döner. */
function fakeFetch(responses: Array<() => Response>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next!();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test("429 yanıtı Retry-After'a saygı göstererek yeniden denenir", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([
    () => new Response("busy", { status: 429, headers: { "Retry-After": "0" } }),
    () => new Response('{"ok":1}', { status: 200 }),
  ]);

  const res = await withFetch(impl, () => fetchWithRetry("https://retry-429.example.com/x", {}, 3));

  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"ok":1}');
  assert.equal(calls.length, 2);
});

test("Retry-After yoksa varsayılan bekleme kullanılır ve sonunda başarılı olur", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([
    () => new Response("busy", { status: 429 }),
    () => new Response("ok", { status: 200 }),
  ]);

  const res = await withFetch(impl, () =>
    fetchWithRetry("https://retry-429b.example.com/x", {}, 2)
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test("tüm denemeler 429 ile dönerse son yanıt yutulmaz", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([() => new Response("busy", { status: 429 })]);

  const res = await withFetch(impl, () =>
    fetchWithRetry("https://retry-429c.example.com/x", {}, 2)
  );

  assert.equal(res.status, 429, "429 son denemede çağırana dönmeli");
  assert.equal(calls.length, 2);
});

test("ağ hatası tüm denemelerde tekrarlanırsa hata fırlatılır", async () => {
  breakerReset();
  cacheClear();
  let n = 0;
  const impl = (async () => {
    n++;
    throw new Error(`socket closed ${n}`);
  }) as unknown as typeof fetch;

  await assert.rejects(
    withFetch(impl, () => fetchWithRetry("https://netfail.example.com/x", {}, 2)),
    /socket closed 2/
  );
  assert.equal(n, 2);
});

test("5xx yanıtı devre sayacını artırır", async () => {
  breakerReset();
  cacheClear();
  const { impl } = fakeFetch([() => new Response("boom", { status: 503 })]);

  await withFetch(impl, () => fetchWithRetry("https://server-error.example.com/x", {}, 1));

  const status = breakerStatus("server-error.example.com");
  assert.equal(status.failures, 1);
  assert.equal(status.open, false, "tek hata devreyi açmaz");
});

test("4 hata üst üste gelince devre açılır ve sonraki istek anında reddedilir", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([() => new Response("boom", { status: 500 })]);

  // Her deneme 1 hata sayılır; devre 4 eşikte açılır
  for (let i = 0; i < 4; i++) {
    await withFetch(impl, () =>
      fetchWithRetry(`https://breaker-open.example.com/x${i}`, {}, 1)
    ).catch(() => undefined);
  }

  assert.equal(isBreakerOpen("breaker-open.example.com"), true);

  await assert.rejects(
    withFetch(impl, () => fetchWithRetry("https://breaker-open.example.com/y", {}, 1)),
    /erişilemiyor/
  );
  assert.equal(calls.length, 4, "devre açıkken ağa istek atılmamalı");
});

test("başarılı yanıt devre sayacını sıfırlar", async () => {
  breakerReset();
  cacheClear();
  const { impl } = fakeFetch([
    () => new Response("boom", { status: 500 }),
    () => new Response("ok", { status: 200 }),
  ]);

  await withFetch(impl, () => fetchWithRetry("https://reset.example.com/a", {}, 1));
  await withFetch(impl, () => fetchWithRetry("https://reset.example.com/b", {}, 1));

  assert.equal(breakerStatus("reset.example.com").failures, 0);
});

test("POST istekleri önbelleğe girmez", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([() => new Response("ok", { status: 200 })]);

  await withFetch(impl, () =>
    fetchWithRetry("https://post.example.com/api", { method: "POST", body: "a=1" }, 1)
  );
  await withFetch(impl, () =>
    fetchWithRetry("https://post.example.com/api", { method: "POST", body: "a=1" }, 1)
  );

  assert.equal(calls.length, 2, "POST her seferinde ağa gitmeli");
});

test("GET olmayan yöntemler de önbelleklenmez", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([() => new Response("ok", { status: 200 })]);

  await withFetch(impl, () => fetchWithRetry("https://head.example.com/x", { method: "HEAD" }, 1));
  await withFetch(impl, () => fetchWithRetry("https://head.example.com/x", { method: "HEAD" }, 1));

  assert.equal(calls.length, 2);
});

test("başarısız istek sonucu önbelleğe yazılmaz", async () => {
  breakerReset();
  cacheClear();
  let calls = 0;
  const impl = (async () => {
    calls++;
    if (calls === 1) return new Response("boom", { status: 500 });
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  await withFetch(impl, () => fetchWithRetry("https://nocache-error.example.com/x", {}, 1));
  const res = await withFetch(impl, () =>
    fetchWithRetry("https://nocache-error.example.com/x", {}, 1)
  );

  assert.equal(res.status, 200);
  assert.equal(calls, 2, "hatalı yanıt ikinci çağrıda tekrar denenmeli");
});

test("önbellekten dönen yanıtın durum kodu ve içerik tipi korunur", async () => {
  breakerReset();
  cacheClear();
  const { impl, calls } = fakeFetch([
    () =>
      new Response("<html>x</html>", {
        status: 202,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  ]);

  const first = await withFetch(impl, () => fetchWithRetry("https://headers.example.com/x", {}, 1));
  const second = await withFetch(impl, () =>
    fetchWithRetry("https://headers.example.com/x", {}, 1)
  );

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(second.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await second.text(), "<html>x</html>");
  assert.equal(calls.length, 1);
});
