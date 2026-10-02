import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cacheGet,
  cacheSet,
  cacheClear,
  cacheStats,
  cached,
  isRetryableError,
  withRetry,
} from "./cache.js";

test("cacheSet/cacheGet: TTL içinde değer döner", () => {
  cacheClear();
  cacheSet("a", { x: 1 }, 60);
  assert.deepEqual(cacheGet("a"), { x: 1 });
  cacheClear();
  assert.equal(cacheGet("a"), null);
});

test("cacheGet: süresi dolmuş girdiyi null döner", async () => {
  cacheClear();
  cacheSet("k", "v", 0.05); // 50ms
  assert.equal(cacheGet("k"), "v");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(cacheGet("k"), null);
  cacheClear();
});

test("cacheStats: isabet/ıskalama sayacı işler", () => {
  cacheClear();
  cacheSet("s", 1, 60);
  cacheGet("s"); // hit
  cacheGet("yok"); // miss
  const stats = cacheStats();
  assert.ok(stats.hits >= 1);
  assert.ok(stats.misses >= 1);
  assert.ok(stats.entries >= 1);
  cacheClear();
});

test("cached: aynı anahtar için işlevi bir kez çalıştırır (tekilleştirme)", async () => {
  cacheClear();
  let calls = 0;
  const fn = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return "sonuc";
  };
  const [a, b, c] = await Promise.all([
    cached("k1", 60, fn),
    cached("k1", 60, fn),
    cached("k1", 60, fn),
  ]);
  assert.equal(calls, 1, "eşzamanlı istekler tekilleştirilmeli");
  assert.equal(a, "sonuc");
  assert.equal(b, "sonuc");
  assert.equal(c, "sonuc");

  // sonraki çağrı önbellekten gelmeli
  await cached("k1", 60, fn);
  assert.equal(calls, 1);
  cacheClear();
});

test("cached: hata durumunda sonraki çağrıyı engellemez", async () => {
  cacheClear();
  let calls = 0;
  await assert.rejects(
    cached("hatali", 60, async () => {
      calls++;
      throw new Error("patlama");
    })
  );
  const ok = await cached("hatali", 60, async () => {
    calls++;
    return "düzeltildi";
  });
  assert.equal(ok, "düzeltildi");
  assert.equal(calls, 2, "hata önbelleğe yazılmamalı");
  cacheClear();
});

test("isRetryableError: ağ hataları yeniden denenebilir, mantık hataları değil", () => {
  assert.equal(isRetryableError(new Error("ETIMEDOUT")), true);
  assert.equal(isRetryableError(new Error("fetch failed")), true);
  assert.equal(isRetryableError(new Error("socket hang up")), true);
  assert.equal(isRetryableError(new Error("429 rate limit")), true);
  assert.equal(isRetryableError(new Error("Schema validation failed")), true);
  assert.equal(isRetryableError(new Error("404 not found")), false);
  assert.equal(isRetryableError(new Error("Sembol bulunamadı")), false);
});

test("withRetry: geçici hatada tekrar dener, kalıcı hatada vazgeçer", async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("ETIMEDOUT");
      return "başarılı";
    },
    { attempts: 3, baseDelayMs: 1 }
  );
  assert.equal(result, "başarılı");
  assert.equal(attempts, 3);

  let fatalAttempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        fatalAttempts++;
        throw new Error("Sembol bulunamadı");
      },
      { attempts: 3, baseDelayMs: 1 }
    ),
    /Sembol bulunamadı/
  );
  assert.equal(fatalAttempts, 1, "yeniden denenemeyen hata tek denemede bırakılmalı");
});

test("withRetry: deneme hakkı biterse son hatayı fırlatır", async () => {
  let attempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        attempts++;
        throw new Error("ETIMEDOUT");
      },
      { attempts: 2, baseDelayMs: 1 }
    ),
    /ETIMEDOUT/
  );
  assert.equal(attempts, 2);
});
