import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface CatalogEntry {
  name: string;
  description: string;
  examples: string[];
}

/**
 * Araç kataloğu — hangi araç ne işe yarar, örnek sorularla birlikte.
 * İstemciler (LLM) `finans://tools/catalog` kaynağını okuyarak doğru aracı seçebilir.
 */
export function registerToolCatalog(server: McpServer): void {
  /** Kayıtlı araç sayısını dinamik okumak için (sabit sayı yazmamak adına). */
  const toolCount = (): number | null => {
    const registry = (server as unknown as { _registeredTools?: unknown })._registeredTools;
    if (registry && typeof registry === "object") {
      return Object.keys(registry).length || null;
    }
    return null;
  };

  const catalog: CatalogEntry[] = [
    {
      name: "get_tcmb_snapshot",
      description:
        "Türkiye ekonomik göstergelerinin hızlı özeti: kurlar, politika faizi, tahvil, altın.",
      examples: ["Türkiye'de para ve piyasa şu an nasıl?", "Kurlar ve politika faizi nedir?"],
    },
    {
      name: "get_exchange_rate",
      description: "İki para birimi arası güncel veya geçmiş kur.",
      examples: ["USD TRY kaç?", "1 Ocak 2024 dolar kaçtı?"],
    },
    {
      name: "get_crypto_price / get_multi_crypto_price",
      description: "Kripto fiyatları (CoinGecko).",
      examples: ["Bitcoin kaç dolar?", "Bitcoin, Ethereum ve Solana fiyatları?"],
    },
    {
      name: "get_technical_indicators",
      description: "RSI, MACD, Bollinger, SMA/EMA/ATR ile teknik analiz ve sinyal yorumu.",
      examples: ["THYAO teknik görünümü?", "AAPL RSI kaç?"],
    },
    {
      name: "get_dividend_history",
      description: "Temettü geçmişi, yıllık toplamlar ve son 12 ay temettü verimi.",
      examples: ["GARAN temettü verimi nedir?", "KO son 3 yılda ne kadar temettü ödedi?"],
    },
    {
      name: "get_analyst_consensus",
      description: "Analist tavsiye dağılımı, yükseliş yüzdesi ve hedef fiyatlar.",
      examples: ["THYAO için analistler ne diyor?"],
    },
    {
      name: "get_earnings_info",
      description: "Yaklaşan bilanço tarihi ve EPS/ciro beklentileri.",
      examples: ["AAPL ne zaman bilanço açıklıyor?"],
    },
    {
      name: "backtest_portfolio",
      description:
        "Portföyün geçmiş performansı: toplam/yıllık getiri, volatilite, maksimum düşüş, Sharpe.",
      examples: ["100 THYAO + 20 AAPL portföyü son 1 yılda nasıl performans gösterdi?"],
    },
    {
      name: "get_market_movers / get_trending_stocks",
      description: "Günün en çok yükselenleri/düşenleri, en aktifler ve trend hisseler.",
      examples: ["Bugün ABD borsasını en çok ne taşıyor?"],
    },
    {
      name: "get_market_indicators",
      description: "VIX, ABD tahvil faizleri (13H/5Y/10Y/30Y), Dolar Endeksi.",
      examples: ["Piyasa risk iştahı nasıl?"],
    },
    {
      name: "get_macro_indicators / get_inflation_data / get_policy_rate",
      description: "GSYİH, enflasyon, işsizlik, cari denge (Dünya Bankası) ve TCMB faizi.",
      examples: ["Türkiye enflasyonu son 3 yılda nasıl seyretti?"],
    },
    {
      name: "get_fund_price / get_viop_quote / get_bist_price / get_bist_indices",
      description: "BIST'e özel: TEFAS fon fiyatları, VİOP kontratları, hisse ve endeks fiyatları.",
      examples: ["GAF fon fiyatı nedir?", "VİOP X10 kontratı?"],
    },
    {
      name: "get_financial_news / get_economic_calendar",
      description: "Finans haberleri (RSS) ve küresel ekonomik takvim.",
      examples: ["Bu hafta hangi ülkeler faiz kararı açıklıyor?"],
    },
    {
      name: "get_crypto_market_overview / get_crypto_fear_greed",
      description: "Kripto piyasa kapitalizasyonu, BTC dominansı ve korku/açgözlülük endeksi.",
      examples: ["Kripto piyasası nasıl?"],
    },
    {
      name: "get_data_health",
      description: "Tüm veri kaynaklarının erişilebilirliği ve yanıt süreleri (teşhis aracı).",
      examples: ["Hangi veri kaynağı çalışmıyor?"],
    },
  ];

  server.registerResource(
    "araç-kataloğu",
    "finans://tools/catalog",
    {
      title: "Finans-MCP Araç Kataloğu",
      description:
        "Sunucudaki araçların ne yaptığının özeti ve örnek kullanıcı soruları. Doğru aracı seçmek için okunabilir.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              server: "finans-mcp",
              toolCount: toolCount(),
              note: "Tüm veri kaynakları ücretsizdir ve API key gerektirmez. Veriler gecikmeli olabilir; yatırım tavsiyesi değildir.",
              tools: catalog,
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
