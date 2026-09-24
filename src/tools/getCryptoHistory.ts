import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchOhlc } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Yaygın kripto adları → Yahoo sembol eşlemesi.
 * TRY dönüşümü USDTRY=X geçmişiyle aynı tarihlere hizalanarak yapılır.
 */
const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  bitcoin: "BTC-USD",
  btc: "BTC-USD",
  ethereum: "ETH-USD",
  eth: "ETH-USD",
  tether: "USDT-USD",
  usdt: "USDT-USD",
  binancecoin: "BNB-USD",
  bnb: "BNB-USD",
  solana: "SOL-USD",
  sol: "SOL-USD",
  ripple: "XRP-USD",
  xrp: "XRP-USD",
  cardano: "ADA-USD",
  ada: "ADA-USD",
  dogecoin: "DOGE-USD",
  doge: "DOGE-USD",
  tron: "TRX-USD",
  avalanche: "AVAX-USD",
  "avalanche-2": "AVAX-USD",
  litecoin: "LTC-USD",
  ltc: "LTC-USD",
  polkadot: "DOT-USD",
  dot: "DOT-USD",
  chainlink: "LINK-USD",
  link: "LINK-USD",
  "shiba-inu": "SHIB-USD",
  "shiba inu": "SHIB-USD",
  matic: "MATIC-USD",
  "matic-network": "MATIC-USD",
  polygon: "MATIC-USD",
  pol: "MATIC-USD",
  "toncoin": "TON11419-USD",
  ton: "TON11419-USD",
  near: "NEAR-USD",
  aptos: "APT-USD",
  apt: "APT-USD",
  arbitrum: "ARB-USD",
  "arbitrum-memecoin": "ARB-USD",
  render: "RNDR-USD",
  rndr: "RNDR-USD",
  "bitcoin-cash": "BCH-USD",
  bch: "BCH-USD",
  cosmos: "ATOM-USD",
  atom: "ATOM-USD",
  vechain: "VET-USD",
  vet: "VET-USD",
  uniswap: "UNI-USD",
  uni: "UNI-USD",
  "lido-dao": "LDO-USD",
  ldo: "LDO-USD",
  filecoin: "FIL-USD",
  fil: "FIL-USD",
  "stellar": "XLM-USD",
  xlm: "XLM-USD",
  "the-graph": "GRT-USD",
  grt: "GRT-USD",
  "internet-computer": "ICP-USD",
  icp: "ICP-USD",
  pepe: "PEPE-USD",
  "usd-coin": "USDC-USD",
  usdc: "USDC-USD",
  sui: "SUI-USD",
  "ethereum-classic": "ETC-USD",
  etc: "ETC-USD",
};

export function registerGetCryptoHistory(server: McpServer) {
  server.tool(
    "get_crypto_history",
    "Bir kripto paranın geçmiş fiyat (OHLC) verisini döndürür. USD veya TRY cinsinden grafik/teknik analiz için uygundur. Örn: bitcoin, ethereum, solana, BNB, XRP.",
    {
      coin: z
        .string()
        .min(1)
        .describe(
          "Kripto adı veya sembolü: 'bitcoin', 'ethereum', 'solana' veya doğrudan 'BTC-USD', 'SOL-USD'"
        ),
      vsCurrency: z
        .enum(["usd", "try"])
        .default("usd")
        .describe("Fiyatların gösterileceği para birimi"),
      period: z
        .enum(["1w", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"])
        .default("1y")
        .describe("Geriye dönük veri aralığı"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1500)
        .default(250)
        .describe("Döndürülecek maksimum veri noktası"),
    },
    async ({ coin, vsCurrency, period, limit }) => {
      const input = coin.trim().toLowerCase();

      // Bilinen ad → sembol; yoksa kullanıcı girişini olduğu gibi kullan
      let usdSymbol: string;
      if (/[A-Z]{3,}-\w+/.test(coin.trim())) {
        usdSymbol = coin.trim().toUpperCase();
      } else if (CRYPTO_SYMBOL_MAP[input]) {
        usdSymbol = CRYPTO_SYMBOL_MAP[input];
      } else if (/\^?[A-Z0-9]{2,10}-USD/i.test(coin)) {
        usdSymbol = coin.trim().toUpperCase();
      } else {
        // bilinmeyen ad: en iyi tahmin {isim}-USD
        usdSymbol = `${input.replace(/\s+/g, "-")}-USD`.toUpperCase();
      }

      try {
        const chart = await fetchOhlc(usdSymbol, { period });

        if (chart.rows.length === 0) {
          return errorResponse(
            `'${coin}' için kripto geçmişi bulunamadı. Adı veya sembolü kontrol edin (bitcoin, ETH-USD vb.).`
          );
        }

        let rows = chart.rows.slice(-limit);

        // TRY dönüşümü: USDTRY=X geçmişiyle hizala
        if (vsCurrency === "try") {
          const usdTry = await fetchOhlc("USDTRY=X", { period });
          const rateMap = new Map(
            usdTry.rows
              .filter((r) => r.close !== null)
              .map((r) => [r.date.slice(0, 10), r.close as number])
          );
          let lastRate = 1;
          const converted = rows.map((r) => {
            const d = r.date.slice(0, 10);
            const rate = rateMap.get(d) ?? lastRate;
            lastRate = rate;
            const f = (v: number | null) => (v === null ? null : v * rate);
            return { ...r, open: f(r.open), high: f(r.high), low: f(r.low), close: f(r.close), adjClose: f(r.adjClose) };
          });
          rows = converted;
        }

        const data = rows.map((r) => ({
          date: r.date.slice(0, 10),
          open: round(r.open),
          high: round(r.high),
          low: round(r.low),
          close: round(r.close),
          volume: r.volume,
        }));

        const closes = rows.filter((r) => r.close !== null).map((r) => r.close as number);
        const first = closes[0];
        const last = closes[closes.length - 1];
        const change = first != null && last != null ? last - first : null;
        const changePercent = first && change != null ? (change / first) * 100 : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  coin: coin.trim(),
                  symbol: chart.symbol,
                  vsCurrency: vsCurrency.toUpperCase(),
                  period,
                  dataPoints: data.length,
                  summary: {
                    firstClose: round(first),
                    lastClose: round(last),
                    change: round(change),
                    changePercent: round(changePercent),
                  },
                  data,
                  source: "Yahoo Finance",
                  dataNote:
                    vsCurrency === "try"
                      ? "TRY fiyatlar USDTRY resmi kuruyla hizalanarak hesaplanmıştır."
                      : "Kripto veriler 15-60 dakika gecikmeli olabilir.",
                },
                null,
                0
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `'${coin}' için kripto geçmişi alınamadı: ${msg}`
        );
      }
    }
  );
}