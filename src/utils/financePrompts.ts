import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Hazır soru şablonları (MCP prompts).
 *
 * Amaç: istemci "prompt/list" çağrısında kullanıcıya hazır analiz akışları sunar.
 * Şablonlar araç çağırmaz; yalnızca doğru araçları doğru sırayla kullanacak
 * metni üretir. Böylece LLM'in hangi aracı seçeceği konusundaki belirsizlik azalır.
 */
export function registerFinancePrompts(server: McpServer) {
  server.registerPrompt(
    "market_morning_brief",
    {
      title: "Sabah Piyasa Brifingi",
      description: "Türkiye + global piyasalar için kısa günlük brifing ister",
      argsSchema: {
        focus: z
          .string()
          .optional()
          .describe("Odak: 'genel' (varsayılan), 'teknoloji', 'enerji', 'bankacılık'"),
      },
    },
    ({ focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Bugünün piyasa brifingini hazırla (${focus ?? "genel"} odaklı).\n\n` +
              "Şu sırayla ilerle:\n" +
              "1. get_tcmb_snapshot — Türkiye makro görünümü (politika faizi, enflasyon)\n" +
              "2. get_bist_price — BIST 100 endeksi günlük değişim\n" +
              "3. get_global_market_summary — global piyasa özeti\n" +
              "4. get_sector_performance (period=5d) — hangi sektörler öne çıkıyor\n" +
              "5. get_market_movers — en çok yükselen/düşenler\n\n" +
              "Çıktı formatı: 5 satırlık madde işaretli özet + tek cümlelik 'bugünün riski'. " +
              "Rakamları mutlaka belirt, tahmin yapma.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "stock_deep_dive",
    {
      title: "Hisse Derinlemesine Analiz",
      description: "Tek bir hisse için temettü, bilanço, analist ve teknik analiz toplu raporu",
      argsSchema: {
        symbol: z.string().describe("Sembol, örn. THYAO veya AAPL"),
      },
    },
    ({ symbol }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `${symbol} hissesini derinlemesine analiz et.\n\n` +
              "Şu araçları kullan:\n" +
              "1. get_company_profile — şirket ne iş yapıyor, hangi sektörde\n" +
              "2. get_stock_price + get_technical_indicators (period=1y) — fiyat ve teknik durum\n" +
              "3. get_dividend_history — temettü verimi ve süreklilik\n" +
              "4. get_earnings_info — yaklaşan bilanço ve beklentiler\n" +
              "5. get_analyst_consensus — analist tavsiyesi ve hedef fiyat\n" +
              "6. compare_stocks — benzer 2-3 hisse ile karşılaştır\n\n" +
              "Çıktı: (a) şirket özeti, (b) sayısal tablo, (c) güçlü yönler / riskler, " +
              "(d) 'veri yok' dediğin alanları açıkça belirt.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "portfolio_review",
    {
      title: "Portföy Değerlendirme",
      description: "Sembol listesine göre portföy risk/getiri ve çeşitlendirme değerlendirmesi",
      argsSchema: {
        symbols: z.string().describe("Virgülle ayrılmış sembol listesi, örn. THYAO,GARAN,AAPL"),
      },
    },
    ({ symbols }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Şu portföyü değerlendir: ${symbols}\n\n` +
              "Şu araçları kullan:\n" +
              "1. get_watchlist — güncel durum tablosu\n" +
              "2. compare_stocks (sortBy=marketCap) — değerleme karşılaştırması\n" +
              "3. analyze_portfolio — toplam/yıllık getiri, volatilite, maksimum düşüş, Sharpe\n" +
              "4. get_correlation — varlıklar arası korelasyon\n\n" +
              "Çıktı: (a) portföy tablosu, (b) risk metrikleri, (c) çeşitlendirme yorumu " +
              "(tek sektördeki aşırı yoğunlaşma varsa belirt), (d) 3 maddelik öneri. " +
              "Yatırım tavsiyesi verme, sadece veriye dayalı yorum yap.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "data_source_diagnosis",
    {
      title: "Veri Kaynağı Teşhisi",
      description: "Hangi kaynağın çalışıp çalışmadığını kontrol eder",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Finans veri kaynaklarının durumunu kontrol et.\n\n" +
              "1. get_data_health çağır ve hangi kaynakların 'down' olduğunu listele\n" +
              "2. Down olan kaynakları hangi araçların kullandığını belirt\n" +
              "3. Devre kesici (circuit breaker) devrede kalan kaynakları ve kalan süreyi yaz\n\n" +
              "Çıktı: kısa bir durum tablosu + varsa kullanıcıya öneri " +
              "(örn. 'X kaynağı 45 sn sonra tekrar denenecek').",
          },
        },
      ],
    })
  );
}
