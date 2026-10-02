import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlobalMarket, parseTrendingCoins } from "./getCryptoMarketOverview.js";

test("parseGlobalMarket: temel alanları özetler", () => {
  const s = parseGlobalMarket({
    data: {
      total_market_cap: { usd: 2_932_331_467_661 },
      total_volume: { usd: 114_174_687_894 },
      market_cap_change_percentage_24h_usd: -0.78,
      market_cap_percentage: { btc: 58.78, eth: 11.32 },
      active_cryptocurrencies: 21782,
      markets: 1508,
      updated_at: 1_789_000_000,
    },
  });
  assert.equal(s.totalMarketCapUsd, 2932331467661);
  assert.equal(s.totalVolume24hUsd, 114174687894);
  assert.equal(s.marketCapChange24hPercent, -0.78);
  assert.equal(s.btcDominance, 58.78);
  assert.equal(s.ethDominance, 11.32);
  assert.equal(s.activeCryptocurrencies, 21782);
});

test("parseGlobalMarket: bozuk/eksik yanıtta null döner", () => {
  const s = parseGlobalMarket({});
  assert.equal(s.totalMarketCapUsd, null);
  assert.equal(s.btcDominance, null);
  assert.equal(parseGlobalMarket(null).markets, null);
});

test("parseTrendingCoins: isim, sembol, fiyat ve değişim", () => {
  const list = parseTrendingCoins({
    coins: [
      {
        item: {
          name: "Bitcoin",
          symbol: "btc",
          market_cap_rank: 1,
          data: { price: 110000, price_change_percentage_24h: { usd: 1.23 } },
        },
      },
    ],
  });
  assert.equal(list[0].name, "Bitcoin");
  assert.equal(list[0].symbol, "btc");
  assert.equal(list[0].priceUsd, 110000);
  assert.equal(list[0].change24h, 1.23);
  assert.equal(list[0].marketCapRank, 1);
});

test("parseTrendingCoins: bozuk girdide varsayılanlar", () => {
  const list = parseTrendingCoins({ coins: [{}] });
  assert.equal(list[0].name, "?");
  assert.equal(list[0].priceUsd, null);
  assert.deepEqual(parseTrendingCoins({}), []);
  assert.deepEqual(parseTrendingCoins(null), []);
});
