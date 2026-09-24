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

// Modül 1: Piyasa Verisi
import { registerGetStockHistory } from "./tools/getStockHistory.js";
import { registerGetCryptoHistory } from "./tools/getCryptoHistory.js";
import { registerGetCommodityPrice } from "./tools/getCommodityPrice.js";
import { registerSearchSymbol } from "./tools/searchSymbol.js";
import { registerGetBistIndices } from "./tools/getBistIndices.js";

// Modül 2: Makroekonomi
import { registerGetMacroIndicators } from "./tools/getMacroIndicators.js";
import { registerGetPolicyRate } from "./tools/getPolicyRate.js";
import { registerGetGovBondYields } from "./tools/getGovBondYields.js";

// Modül 3: Yatırım Analizi
import { registerGetFundamentals } from "./tools/getFundamentals.js";
import { registerGetCorrelation } from "./tools/getCorrelation.js";
import { registerAnalyzePortfolio } from "./tools/analyzePortfolio.js";

// Modül 4: BIST'e Özel
import { registerGetFundPrice } from "./tools/getFundPrice.js";
import { registerGetViopQuote } from "./tools/getViopQuote.js";
import { registerGetMarketSummary } from "./tools/getMarketSummary.js";

// Modül 5: Haber & Takvim
import { registerGetEconomicCalendar } from "./tools/getEconomicCalendar.js";
import { registerGetFinancialNews } from "./tools/getFinancialNews.js";

async function main() {
  const server = new McpServer({
    name: "finans-mcp",
    version: "1.2.0",
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

  // Makroekonomik veri (Dünya Bankası / TÜİK)
  registerGetInflationData(server);   // Türkiye TÜFE enflasyon verisi

  // --- Modül 1: Piyasa Verisi ---
  registerGetStockHistory(server);    // Geçmiş OHLC / grafik verisi
  registerGetCryptoHistory(server);   // Kripto geçmiş (USD/TRY)
  registerGetCommodityPrice(server);  // Altın, petrol, gümüş vb.
  registerSearchSymbol(server);       // Sembol arama (Yahoo)
  registerGetBistIndices(server);     // BIST endeksleri

  // --- Modül 2: Makroekonomi ---
  registerGetMacroIndicators(server); // GSYİH, enflasyon, istihdam vb.
  registerGetPolicyRate(server);      // TCMB politika faizi
  registerGetGovBondYields(server);   // 10 yıllık / gösterge tahvil

  // --- Modül 3: Yatırım Analizi ---
  registerGetFundamentals(server);    // F/K, EPS, temettü vb.
  registerGetCorrelation(server);     // Varlık korelasyonu
  registerAnalyzePortfolio(server);   // Portföy analizi

  // --- Modül 4: BIST'e Özel ---
  registerGetFundPrice(server);       // TEFAS fon fiyatları
  registerGetViopQuote(server);       // VİOP kontratları
  registerGetMarketSummary(server);   // Piyasa özeti

  // --- Modül 5: Haber & Takvim ---
  registerGetEconomicCalendar(server);// Ekonomik takvim
  registerGetFinancialNews(server);   // Finans haberleri (RSS)

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("finans-mcp v1.2.0 — stdio üzerinde çalışıyor. (25 tool aktif)");
}

main().catch((error) => {
  console.error("finans-mcp başlatılamadı:", error);
  process.exit(1);
});
