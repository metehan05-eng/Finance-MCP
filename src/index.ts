#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerGetExchangeRate } from "./tools/getExchangeRate.js";
import { registerGetCryptoPrice } from "./tools/getCryptoPrice.js";
import { registerConvertCurrency } from "./tools/convertCurrency.js";
import { registerGetTcmbRate } from "./tools/getTcmbRate.js";
import { registerGetBistPrice } from "./tools/getBistPrice.js";
import { registerGetInflationData } from "./tools/getInflationData.js";
import { registerGetHistoricalRate } from "./tools/getHistoricalRate.js";
import { registerGetMultiCryptoPrice } from "./tools/getMultiCryptoPrice.js";
import { registerGetGlobalStockPrice } from "./tools/getGlobalStockPrice.js";

async function main() {
  const server = new McpServer({
    name: "finans-mcp",
    version: "1.1.0",
  });

  // Döviz & para birimi (Frankfurter / ECB)
  registerGetExchangeRate(server);    // Güncel veya geçmiş kur
  registerConvertCurrency(server);    // Para birimi çevirici
  registerGetHistoricalRate(server);  // Geçmiş tarihe göre kur

  // TCMB resmi kur bülteni (alış/satış ayrımlı)
  registerGetTcmbRate(server);

  // Kripto para (CoinGecko)
  registerGetCryptoPrice(server);     // Tekli kripto fiyatı
  registerGetMultiCryptoPrice(server); // Çoklu kripto fiyatı

  // Borsa İstanbul & Küresel Piyasalar (Yahoo Finance)
  registerGetBistPrice(server);
  registerGetGlobalStockPrice(server); // Dünyadaki tüm hisseler (AAPL, NVDA, TSLA vb.)

  // Makroekonomik veri (FRED / TÜİK)
  registerGetInflationData(server);   // Türkiye TÜFE enflasyon verisi

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("finans-mcp v1.2.0 — stdio üzerinde çalışıyor. (9 tool aktif)");
}

main().catch((error) => {
  console.error("finans-mcp başlatılamadı:", error);
  process.exit(1);
});
