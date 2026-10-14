import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTcmbXml } from "./xmlParser.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Date="07.10.2026" Bulten_No="2026/190">
  <Currency CurrencyCode="USD">
    <Unit>1</Unit>
    <CurrencyName>ABD DOLARI</CurrencyName>
    <ForexBuying>42.1500</ForexBuying>
    <ForexSelling>42.2300</ForexSelling>
    <BanknoteBuying>42.1000</BanknoteBuying>
    <BanknoteSelling>42.3000</BanknoteSelling>
  </Currency>
  <Currency CurrencyCode="EUR">
    <Unit>1</Unit>
    <CurrencyName>EURO</CurrencyName>
    <ForexBuying>45.6000</ForexBuying>
    <ForexSelling>45.7000</ForexSelling>
    <BanknoteBuying></BanknoteBuying>
    <BanknoteSelling></BanknoteSelling>
  </Currency>
</Tarih_Date>`;

test("parseTcmbXml: tarih, bülten ve kurları çözer", () => {
  const data = parseTcmbXml(SAMPLE);
  assert.equal(data.date, "07.10.2026");
  assert.equal(data.bulletinNo, "2026/190");
  assert.equal(data.currencies.length, 2);
  const usd = data.currencies[0];
  assert.equal(usd.code, "USD");
  assert.equal(usd.unit, 1);
  assert.equal(usd.forexBuying, 42.15);
  assert.equal(usd.forexSelling, 42.23);
  assert.equal(usd.banknoteBuying, 42.1);
  assert.equal(usd.banknoteSelling, 42.3);
  const eur = data.currencies[1];
  assert.equal(eur.code, "EUR");
  assert.equal(eur.forexBuying, 45.6);
  assert.equal(eur.banknoteBuying, null, "boş alan null olmalı");
});

test("parseTcmbXml: kök eleman yoksa açıklayıcı hata fırlatır", () => {
  assert.throws(() => parseTcmbXml("<html><body>404</body></html>"), /Tarih_Date/);
});

test("parseTcmbXml: Currency düğümü yoksa boş liste döner", () => {
  const data = parseTcmbXml('<Tarih_Date Date="01.01.2026" Bulten_No="x"></Tarih_Date>');
  assert.deepEqual(data.currencies, []);
});

test("parseTcmbXml: tek Currency düğümü de diziye alınır", () => {
  const one = `<Tarih_Date Date="01.01.2026" Bulten_No="x">
    <Currency CurrencyCode="GBP"><Unit>1</Unit><ForexBuying>50.0</ForexBuying></Currency>
  </Tarih_Date>`;
  const data = parseTcmbXml(one);
  assert.equal(data.currencies.length, 1);
  assert.equal(data.currencies[0].code, "GBP");
  assert.equal(data.currencies[0].forexBuying, 50);
});
