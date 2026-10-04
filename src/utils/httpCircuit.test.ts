import test from "node:test";
import assert from "node:assert/strict";
import {
  breakerStatus,
  breakerReset,
  breakerSnapshot,
  isBreakerOpen,
  markProbing,
  recordFailure,
  recordSuccess,
  BreakerOpenError,
  assertBreakerClosed,
  DEFAULT_BREAKER,
} from "./httpCircuit.js";

test("eşik sayısına kadar devre kapalı kalır", () => {
  breakerReset();
  const host = "a.example.com";
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold - 1; i++) recordFailure(host);
  assert.equal(isBreakerOpen(host), false);
});

test("eşik aşılınca devre açılır ve kalan süre bildirilir", () => {
  breakerReset();
  const host = "b.example.com";
  const now = 1_000_000;
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure(host, now);

  const status = breakerStatus(host, now + 1000);
  assert.equal(status.open, true);
  assert.equal(status.failures, DEFAULT_BREAKER.failureThreshold);
  assert.equal(status.retryInMs, DEFAULT_BREAKER.cooldownMs - 1000);
});

test("soğuma süresi dolunca devre kapanır (yarı açık)", () => {
  breakerReset();
  const host = "c.example.com";
  const now = 2_000_000;
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure(host, now);

  assert.equal(isBreakerOpen(host, now + 1000), true);
  assert.equal(isBreakerOpen(host, now + DEFAULT_BREAKER.cooldownMs + 1), false);
});

test("yarı açık denemesi başarısız olursa devre yeniden açılır", () => {
  breakerReset();
  const host = "d.example.com";
  const now = 3_000_000;
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure(host, now);

  const afterCooldown = now + DEFAULT_BREAKER.cooldownMs + 10;
  markProbing(host, afterCooldown);
  assert.equal(breakerSnapshot().find((s) => s.host === host)?.status.probing, true);

  // Deneme başarısız → sayaç eşiğe döner ve devre aynı anda yeniden açılır
  recordFailure(host, afterCooldown);
  assert.equal(isBreakerOpen(host, afterCooldown), true, "devre anında yeniden açılır");
  assert.equal(breakerStatus(host, afterCooldown).failures, DEFAULT_BREAKER.failureThreshold);
});

test("başarılı istek sayacı sıfırlar ve devreyi kapatır", () => {
  breakerReset();
  const host = "e.example.com";
  recordFailure(host);
  recordFailure(host);
  recordSuccess(host);

  assert.equal(
    breakerSnapshot().some((s) => s.host === host),
    false
  );
  assert.equal(isBreakerOpen(host), false);
});

test("açık devrede istek anında BreakerOpenError fırlatır", () => {
  breakerReset();
  const host = "f.example.com";
  const now = 4_000_000;
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure(host, now);

  assert.throws(
    () => assertBreakerClosed(host, now + 500),
    (err: unknown) => {
      assert.ok(err instanceof BreakerOpenError);
      assert.equal(err.host, host);
      assert.match(err.message, /erişilemiyor/);
      return true;
    }
  );
});

test("kapalı devrede kontrol hata fırlatmaz", () => {
  breakerReset();
  assert.doesNotThrow(() => assertBreakerClosed("g.example.com"));
});

test("farklı hostlar birbirini etkilemez", () => {
  breakerReset();
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure("blocked.example.com");
  assert.equal(isBreakerOpen("blocked.example.com"), true);
  assert.equal(isBreakerOpen("healthy.example.com"), false);
});

test("reset tüm devreleri temizler", () => {
  breakerReset();
  for (let i = 0; i < DEFAULT_BREAKER.failureThreshold; i++) recordFailure("x.example.com");
  assert.ok(breakerSnapshot().length > 0);
  breakerReset();
  assert.equal(breakerSnapshot().length, 0);
});
