import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface CatalogEntry {
  name: string;
  description: string;
  examples: string[];
}

/**
 * Araç kataloğu — her araç için tek giriş (ad, açıklama, örnek sorular).
 * İstemciler (LLM) `finans://tools/catalog` kaynağını okuyarak doğru aracı seçebilir.
 * toolCatalog.test.ts, bu listenin gerçekten kayıtlı araçlarla birebir eşleştiğini doğrular.
 */
export const TOOL_CATALOG: CatalogEntry[] = [
  {
    name: "get_tcmb_snapshot",
    description:
      "Türkiye ekonomik göstergelerinin hızlı özeti: kurlar, politika faizi, tahvil, altın.",
    examples: ["Türkiye'de para ve piyasa şu an nasıl?", "Kurlar ve politika faizi nedir?"],
  },
  {
    name: "get_tcmb_rate",
    description: "TCMB döviz kurları: bugünün veya arşivdeki bir tarihin kurları.",
    examples: ["TCMB dolar kuru kaç?", "3 Ocak 2024 TCMB kurları?"],
  },
  {
    name: "get_exchange_rate",
    description: "İki para birimi arası güncel veya geçmiş kur.",
    examples: ["USD TRY kaç?", "1 Ocak 2024 dolar kaçtı?"],
  },
  {
    name: "get_historical_rate",
    description: "Bir kur çifti için geçmiş dönem serisi (tarih aralığında).",
    examples: ["USD/TRY son 1 yılda nasıl değişti?"],
  },
  {
    name: "convert_currency",
    description: "Belirli bir tutarı bir para biriminden diğerine çevirir.",
    examples: ["1000 dolar kaç TL?", "500 euro kaç TL eder?"],
  },
  {
    name: "get_altin_gram_price",
    description: "Gram altın fiyatı (TL) ve ons altın (USD) bilgisi.",
    examples: ["Gram altın ne kadar?", "Çeyrek altın fiyatı?"],
  },
  {
    name: "get_crypto_price",
    description: "Tek bir kripto varlığın güncel fiyatı (CoinGecko).",
    examples: ["Bitcoin kaç dolar?", "Solana fiyatı?"],
  },
  {
    name: "get_multi_crypto_price",
    description: "Birden fazla kripto varlığın fiyatını tek istekte döndürür.",
    examples: ["Bitcoin, Ethereum ve Solana fiyatları?"],
  },
  {
    name: "get_crypto_history",
    description: "Bir kripto varlığın geçmiş fiyat serisi.",
    examples: ["Ethereum son 30 günde nasıl hareket etti?"],
  },
  {
    name: "get_crypto_market_overview",
    description: "Kripto piyasa kapitalizasyonu, BTC dominansı ve genel piyasa görünümü.",
    examples: ["Kripto piyasası nasıl?", "BTC dominansı kaç?"],
  },
  {
    name: "get_crypto_movers",
    description: "24 saat veya 7 günlük en çok yükselen/düşen coinler ve piyasa medyanı.",
    examples: ["Bugün en çok yükselen coinler hangileri?", "En çok düşen 5 coin"],
  },
  {
    name: "get_crypto_fear_greed",
    description: "Kripto korku/açgözlülük endeksi ve yorumu.",
    examples: ["Kripto korku endeksi kaç?"],
  },
  {
    name: "get_technical_indicators",
    description: "RSI, MACD, Bollinger, SMA/EMA/ATR ile teknik analiz ve sinyal yorumu.",
    examples: ["THYAO teknik görünümü?", "AAPL RSI kaç?"],
  },
  {
    name: "get_stock_history",
    description: "Bir hisse/endeks için geçmiş OHLC fiyat serisi.",
    examples: ["THYAO son 6 ayın grafiği", "AAPL 1 yıllık fiyat geçmişi"],
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
    name: "get_fundamentals",
    description: "Hisse temel verileri: F/K, PD/DD, ROE, borç, marjlar, büyüme.",
    examples: ["THYAO temel verileri nasıl?", "AAPL F/K kaç?"],
  },
  {
    name: "get_company_profile",
    description: "Şirket profili: sektör, sanayi, ülke, çalışan sayısı, web sitesi, iş özeti.",
    examples: ["THYAO hangi sektörde, kaç kişi çalışıyor?"],
  },
  {
    name: "compare_stocks",
    description:
      "2-8 hisseyi fiyat, piyasa değeri, F/K, F/DD, ROE, temettü verimi, 52 hafta ve beta bazında karşılaştırır.",
    examples: ["THYAO ile GARAN'ı karşılaştır", "AAPL ve NVDA hangisi daha ucuz?"],
  },
  {
    name: "get_bist_price",
    description: "BIST hisse senedi güncel fiyatı ve temel kotasyon bilgileri.",
    examples: ["THYAO kaç TL?", "ASELS fiyatı?"],
  },
  {
    name: "get_bist_indices",
    description: "BIST endekslerinin (XU100, XU030 vb.) güncel değerleri.",
    examples: ["BIST 100 kaç?", "Endeksler bugün nasıl?"],
  },
  {
    name: "get_fund_price",
    description: "TEFAS yatırım fonu fiyatı ve getirisi.",
    examples: ["GAF fon fiyatı nedir?"],
  },
  {
    name: "get_viop_quote",
    description: "VİOP vadeli işlem kontratı kotasyonu.",
    examples: ["VİOP X10 kontratı?"],
  },
  {
    name: "get_global_stock_price",
    description: "Küresel (ABD ve diğer) hisse senedi güncel fiyatı.",
    examples: ["AAPL kaç dolar?", "Tesla fiyatı?"],
  },
  {
    name: "get_market_summary",
    description: "Genel piyasa özeti: öne çıkan endeksler, kurlar ve emtialar.",
    examples: ["Piyasalar bugün nasıl?"],
  },
  {
    name: "get_market_movers",
    description: "Günün en çok yükselenleri, düşenleri ve en aktif hisseleri.",
    examples: ["Bugün ABD borsasını en çok ne taşıyor?"],
  },
  {
    name: "get_trending_stocks",
    description: "Trend olan / ilgi gören hisseler.",
    examples: ["Bugün trend hisseler hangileri?"],
  },
  {
    name: "get_market_indicators",
    description: "VIX, ABD tahvil faizleri (13H/5Y/10Y/30Y) ve Dolar Endeksi.",
    examples: ["Piyasa risk iştahı nasıl?"],
  },
  {
    name: "get_gov_bond_yields",
    description: "Devlet tahvili faiz getirileri (ABD/Türkiye vadeler).",
    examples: ["ABD 10 yıllık tahvil faizi kaç?"],
  },
  {
    name: "get_sector_performance",
    description:
      "ABD sektör performansı: 11 sektör ETF'i üzerinden dönem getirisi sıralaması, en güçlü/zayıf sektör.",
    examples: ["Bu ay hangi sektör öne çıktı?", "ABD sektörleri nasıl?"],
  },
  {
    name: "get_correlation",
    description: "Varlıklar arası korelasyon matrisi (çeşitlendirme analizi için).",
    examples: ["THYAO ile GARAN korelasyonu?", "Altın ile BTC ilişkisi?"],
  },
  {
    name: "get_macro_indicators",
    description: "GSYİH, işsizlik, cari denge gibi makro göstergeler (Dünya Bankası).",
    examples: ["Türkiye işsizlik oranı?", "GSYİH büyümesi?"],
  },
  {
    name: "get_inflation_data",
    description: "Enflasyon (TÜFE) verileri ve yıllık değişim.",
    examples: ["Türkiye enflasyonu son 3 yılda nasıl seyretti?"],
  },
  {
    name: "get_policy_rate",
    description: "Politika faizi (TCMB / Fed) bilgisi.",
    examples: ["TCMB faiz kaç?", "Fed faiz kararı?"],
  },
  {
    name: "get_financial_news",
    description: "Finans haberleri (RSS akışları).",
    examples: ["Son finans haberleri", "THYAO haberleri"],
  },
  {
    name: "get_economic_calendar",
    description: "Küresel ekonomik takvim: yaklaşan veri ve faiz kararları.",
    examples: ["Bu hafta hangi ülkeler faiz kararı açıklıyor?"],
  },
  {
    name: "get_commodity_price",
    description: "Emtia fiyatları (altın, gümüş, petrol, bakır vb.).",
    examples: ["Brent petrol kaç dolar?", "Gümüş fiyatı?"],
  },
  {
    name: "analyze_portfolio",
    description:
      "Portföyün değeri, sektör/para birimi dağılımı, getirisi, riski (volatilite), Sharpe oranı ve günlük değişimi.",
    examples: ["100 THYAO + 20 AAPL portföyüm nasıl?", "Portföyümün sektör dağılımı?"],
  },
  {
    name: "backtest_portfolio",
    description:
      "Portföyün geçmiş performansı: toplam/yıllık getiri, volatilite, maksimum düşüş, Sharpe.",
    examples: ["100 THYAO + 20 AAPL portföyü son 1 yılda nasıl performans gösterdi?"],
  },
  {
    name: "get_watchlist",
    description:
      "İzleme listesi: anlık durum, en çok yükselen-düşen. Sembol verilmezse diske kaydedilmiş liste okunur.",
    examples: ["Takip listemi kontrol et"],
  },
  {
    name: "save_watchlist",
    description: "İzleme listesini diske kalıcı olarak kaydeder.",
    examples: ["THYAO, GARAN, BTC-USD listeme ekle"],
  },
  {
    name: "search_symbol",
    description: "Sembol / şirket adı araması ve eşleşen enstrümanlar.",
    examples: ["Türk Hava Yolları sembolü ne?", "Apple sembolü?"],
  },
  {
    name: "get_data_health",
    description: "Tüm veri kaynaklarının erişilebilirliği ve yanıt süreleri (teşhis aracı).",
    examples: ["Hangi veri kaynağı çalışmıyor?"],
  },
];

// Katalog girdisi tipini dosya dışına da aç (testler ve diğer modüller kullanabilir).
export type { CatalogEntry };

/**
 * `finans://tools/catalog` kaynağını kaydeder. İçerik TOOL_CATALOG'dan üretilir;
 * böylece katalog, gerçek araç listesiyle tek kaynaktan senkron kalır.
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
              tools: TOOL_CATALOG,
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
