import test from "node:test";
import assert from "node:assert/strict";
import { forexTicker } from "./yahoo.js";

test("forexTicker: döviz çiftini doğru Yahoo sembolüne çevirir", () => {
  assert.equal(forexTicker("USD/TRY"), "USDTRY=X");
  assert.equal(forexTicker("usd/try"), "USDTRY=X");
  assert.equal(forexTicker("EUR/USD"), "EURUSD=X");
  assert.equal(forexTicker("  GBP/JPY "), "GBPJPY=X");
});

test("forexTicker: döviz çifti değilse null döner", () => {
  assert.equal(forexTicker("THYAO"), null);
  assert.equal(forexTicker("BTC-USD"), null);
  assert.equal(forexTicker("AAPL"), null);
  assert.equal(forexTicker(""), null);
});
