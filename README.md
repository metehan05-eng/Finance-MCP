# Finance-MCP (Global & BIST Finans MCP Server)

Türkiye (BIST) ve global finans piyasalarına doğrudan erişim sağlayan açık kaynaklı bir **Model Context Protocol (MCP)** sunucusu. 

**Cursor, Claude Desktop ve Claude Code** gibi yapay zeka araçlarının; BIST hisselerine, küresel hisse senetlerine (NVIDIA, Apple, Tesla vb.), kripto para fiyatlarına, döviz kurlarına, enflasyon verilerine, makroekonomik göstergelere, **teknik analiz indikatörlerine**, portföy backtest'ine, VİOP/TEFAS verilerine ve finans haberlerine canlı erişmesini sağlar.

> 💡 **Tüm veri kaynakları tamamen ücretsizdir ve herhangi bir API Key gerektirmez!**

---

## 🚀 Sunulan Araçlar (42 Araç)

### Döviz & Para Birimi
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_exchange_rate` | İki para birimi arasındaki güncel veya geçmiş döviz kuru (Örn: `USD` -> `TRY`) | Frankfurter (ECB) |
| `convert_currency` | Belirli bir miktarı güncel kur üzerinden başka bir para birimine çevirme | Frankfurter (ECB) |
| `get_historical_rate` | 1999'dan itibaren belirli bir tarihteki döviz kuru | Frankfurter (ECB) |
| `get_tcmb_rate` | TCMB resmi bülteninden alış/satış kurları | TCMB XML |

### Borsa İstanbul & Küresel Hisse
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_bist_price` | BIST hisse senetlerinin güncel fiyatı, piyasa değeri ve 52h zirve/dip verileri (Örn: `THYAO`, `ASELS`) | Yahoo Finance |
| `get_global_stock_price` | Dünyadaki tüm hisseler (AAPL, NVDA, TSLA), endeksler (S&P 500, NASDAQ) ve ETF'ler | Yahoo Finance |
| `get_stock_history` | Bir hissenin geçmiş OHLC (grafik) verisi — teknik analiz için (`THYAO.IS`, `AAPL`, `NVDA`) | Yahoo Finance |
| `search_symbol` | İsme göre sembol (ticker) arama — `"ASELSAN"` → `ASELS.IS` | Yahoo Finance |
| `get_bist_indices` | BIST endekslerinin güncel değeri/değişimi (`XU100`, `XU030`, `XBANK`...) | Yahoo Finance |

### Kripto Para
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_crypto_price` | Kripto paraların seçilen para birimi cinsinden güncel fiyatı, piyasa değeri ve 24s hacmi | CoinGecko |
| `get_multi_crypto_price` | Birden fazla kripto paranın fiyatını tek sorguda getirme | CoinGecko |
| `get_crypto_history` | Kripto geçmiş OHLC verisi (USD veya TRY) — `bitcoin`, `ethereum`, `solana` | Yahoo Finance |

### Emtia
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_commodity_price` | Altın, gümüş, petrol (WTI/Brent), doğalgaz, bakır, platin vb. emtia fiyatları | Yahoo Finance |

### Makroekonomi
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_inflation_data` | Türkiye TÜFE enflasyonu (yıllık, Dünya Bankası) | World Bank / TÜİK |
| `get_macro_indicators` | GSYİH büyümesi, kişi başı GSYİH, enflasyon, işsizlik, cari denge, rezervler (ülke bazlı) | World Bank + FRED |
| `get_policy_rate` | TCMB politika faizi (1 hafta repo) ve geçmiş faiz değişimleri | TCMB |
| `get_gov_bond_yields` | 10 yıllık & gösterge devlet tahvili faizleri | doviz.com |

### Yatırım Analizi
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_fundamentals` | F/K, EPS, PD/DD, temettü verimi, marjlar, beta, analist hedefleri | Yahoo Finance |
| `get_correlation` | İki varlık arasındaki fiyat/getiri korelasyonu + yıllık getiri & volatilite | Yahoo Finance |
| `analyze_portfolio` | Portföy değeri, günlük değişim, ağırlıklar, risk/Sharp tahmini, para birimi dağılımı | Yahoo Finance |

### BIST'e Özel
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_fund_price` | TEFAS yatırım fonu güncel fiyatı (NAV) ve son dönem verisi | TEFAS |
| `get_viop_quote` | VİOP vadeli kontrat fiyat, alış/satış ve hacim bilgileri | OYAK Yatırım |
| `get_market_summary` | BIST piyasa özeti: ana endeksler + banka/sanayi watchlist'i | Yahoo Finance |

### Haber & Takvim
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_economic_calendar` | Küresel ekonomik takvim (faiz kararları, enflasyon, istihdam...) — ülke/etki filtresi | ForexFactory |
| `get_financial_news` | Hisse/endeks/kripto/döviz hakkında güncel haber başlıkları | Yahoo Finance RSS |

### Teknik Analiz
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_technical_indicators` | RSI(14), SMA(20/50/200), EMA(12/26), MACD(12/26/9), Bollinger bantları, ATR(14) + sinyal yorumu | Yahoo Finance + yerel hesaplama |
| `get_market_movers` | Günün en çok yükselenleri/düşenleri, en aktifler, büyüme teknoloji hisseleri vb. hazır listeler | Yahoo Finance Screener |
| `get_trending_stocks` | Bölgeye göre en çok trend/ilgi gören hisseler (fiyat ve değişimle) | Yahoo Finance Trending |

### Piyasa Göstergeleri & Türkiye
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_market_indicators` | VIX (korku endeksi), ABD 13 hafta/5/10/30 yıl tahvil faizleri, Dolar Endeksi (DXY), getiri eğrisi yorumu | Yahoo Finance |
| `get_altin_gram_price` | Altın ons (USD) ve gram altın (TRY) fiyatı — 24 ayar ve 22 ayar (ziynet) | Yahoo Finance |
| `get_tcmb_snapshot` | Türkiye özeti: ana döviz kurları, TCMB politika faizi, ABD 10Y tahvil, gram altın | Yahoo Finance + TCMB |

### Gelişmiş Analiz
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `backtest_portfolio` | Portföy backtest: toplam/yıllık getiri, volatilite, maksimum düşüş, Sharpe, varlık katkıları (TRY→USD çevrimi) | Yahoo Finance OHLC |
| `get_crypto_fear_greed` | Kripto Korku & Açgözlülük Endeksi (0-100) güncel değer ve 30 günlük geçmiş | alternative.me |
| `get_crypto_market_overview` | Kripto piyasa kapitalizasyonu, 24s hacim/değişim, BTC-ETH dominansı, en çok aranan kriptolar | CoinGecko |

### Temettü, Bilanço & Analist
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_dividend_history` | Temettü geçmişi, yıllık toplamlar, son 12 ay temettü verimi ve ödeme sürekliliği | Yahoo Finance |
| `get_earnings_info` | Yaklaşan bilanço tarihi, tahmini EPS/ciro aralığı, tahmin edilen büyüme | Yahoo Finance |
| `get_analyst_consensus` | Analist tavsiye dağılımı, yükseliş yüzdesi, ortalama/düşük/yüksek hedef fiyat | Yahoo Finance |

### Şirket, Karşılaştırma & Sektör
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_company_profile` | Şirket profili: sektör, sanayi, ülke, çalışan sayısı, web sitesi, iş özeti | Yahoo Finance |
| `compare_stocks` | 2-8 hisseyi fiyat, piyasa değeri, F/K, F/DD, ROE, temettü verimi, 52 hafta, beta ile karşılaştırır | Yahoo Finance |
| `get_sector_performance` | 11 ABD sektör ETF'i ile dönem getirisi sıralaması, en güçlü/zayıf sektör | Yahoo Finance |
| `get_watchlist` | 20 sembole kadar izleme listesi: anlık durum, en çok yükselen/düşen | Yahoo Finance |

### Sistem
| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_data_health` | Tüm veri kaynaklarının erişilebilirliği, yanıt süresi, önbellek ve devre kesici durumu (teşhis) | Çoklu kaynak |

> 📚 İstemciler `finans://tools/catalog` kaynağını okuyarak araç kataloğunu ve örnek soruları görebilir.
>
> 🧩 **Hazır soru şablonları** (`prompts/list`): `market_morning_brief` (sabah brifingi), `stock_deep_dive` (hisse derinlemesine analiz), `portfolio_review` (portföy değerlendirme), `data_source_diagnosis` (kaynak teşhisi).

---

## 📦 Kurulum

Node.js (>= 22) yüklü olduğundan emin olun:

```bash
git clone https://github.com/metehan05-eng/Finance-MCP.git
cd Finance-MCP
npm install
npm run build
```

**Docker ile:**

```bash
docker build -t finans-mcp .
docker run -i --rm finans-mcp
```

**Docker'ı MCP istemcisine bağlama (Claude Desktop config):**

```json
{
  "mcpServers": {
    "finans-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "finans-mcp"]
    }
  }
}
```

---

## 🖥️ Cursor ile Bağlama (2 Kolay Yol)

### 1. Yol (Otomatik Proje Ayarı - En Kolay)
Projenin kök dizininde hazır bulunan `.cursor/mcp.json` dosyası sayesinde; bu klasörü Cursor ile açtığınızda **MCP sunucusu otomatik olarak tanınır**:

1. Cursor'ı açın ve `Finance-MCP` klasörünü açın.
2. `Ctrl + L` (Mac'te `Cmd + L`) ile Chat'i açın.
3. Chat kutusunda **Agent** modunu seçin.

### 2. Yol (Global Cursor Ayarı)
Başka projelerde çalışırken de bu sunucuyu kullanmak isterseniz:
1. Cursor'da sağ üstteki **Ayarlar (Çark ⚙️)** simgesine tıklayın (veya `Ctrl + Shift + J`).
2. Sol menüden **Features > MCP Servers** bölümüne gelin.
3. **"+ Add New MCP Server"** butonuna tıklayın:
   * **Name:** `finance-mcp`
   * **Type:** `command`
   * **Command:** `node /tam/dosya/yolu/Finance-MCP/build/index.js`

---

## 🤖 Claude Desktop ile Bağlama

Claude Desktop uygulamasında ayar dosyanızı açın:
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **Linux:** `~/.config/Claude/claude_desktop_config.json`

Dosyanın içine şu bloğu ekleyin (dosya yolunu kendi sisteminize göre güncelleyin):

```json
{
  "mcpServers": {
    "finance-mcp": {
      "command": "node",
      "args": [
        "/mutlak/dosya/yolu/Finance-MCP/build/index.js"
      ]
    }
  }
}
```

Claude Desktop uygulamasını yeniden başlatın. Sağ altta çekiç (Tools) simgesinde **25 tool** aktif olarak görünecektir.

---

## 💻 Claude Code (CLI) ile Bağlama

```bash
claude mcp add finance-mcp -- node /mutlak/dosya/yolu/Finance-MCP/build/index.js
```

---

## 💬 Örnek Komutlar & Sorular

Cursor veya Claude'a doğrudan şunları sorabilirsiniz:

* *"NVIDIA (NVDA), Apple (AAPL) ve THYAO hisselerini karşılaştıran bir analiz tablosu yap."*
* *"Bitcoin ve Solana'nın güncel Türk Lirası fiyatları nedir?"*
* *"250.000 TL ile teknoloji hisseleri ve kriptodan oluşan dengeli bir portföy önerisi simüle et."*
* *"1500 Euro kaç Türk Lirası ediyor?"*
* *"BIST'te ASELS ve TUPRS 52 haftalık zirvelerine ne kadar uzaklıkta?"*
* *"THYAO ve BIST 100 arasındaki korelasyon nedir?"*
* *"TCMB politika faizi ve son 5 faiz değişikliğini göster."*
* *"Türkiye'nin GSYİH büyümesi ve işsizlik oranı son 3 yılda nasıl değişti?"*
* *"Bitcoin'in son 6 aylık grafiğini çiz."*
* *"Bu portföyü analiz et: 100 adet THYAO.IS (maliyet 280), 500 adet GARAN.IS (maliyet 300), 10 adet AAPL (maliyet 150)."*
* *"GAF fonunun son haftadaki fiyatını göster."*
* *"VİOP'taki X10 vadeli kontratının fiyatını göster."*
* *"THYAO hissesinin son 6 ayının RSI, MACD ve Bollinger değerlerini ve teknik görünümünü söyle."*
* *"AAPL için 50 ve 200 günlük ortalamaya göre trend yukarı mı aşağı mı?"*
* *"Bugün ABD borsasını en çok ne taşıyan hisseler hangileri?"*
* *"Şu an VIX kaç, piyasa korku seviyesinde mi? ABD 10 yıllık tahvil faizi ne kadar?"*
* *"Bugün gram altın kaç TL?"*
* *"Türkiye'nin kurları, politika faizi ve tahvil getirisi tek bakışta nasıl?"*
* *"100 adet THYAO.IS ve 20 adet AAPL'dan oluşan portföyün son 1 yılda getirisi, Sharpe'ı ve maksimum düşüşü ne?"*
* *"Kripto piyasasında şu an korku mu açgözlülük hâkim?"*

---

## 🛠️ Geliştirme

```bash
npm run dev           # Kod değişikliklerini izler ve otomatik derler
npm run lint          # ESLint (TypeScript) kontrolü
npm run format        # Prettier ile kod formatlama
npm test              # Derleme + birim testler (node --test)
npm run test:coverage # Birim testler + satır kapsamı raporu
npm run smoke         # Canlı smoke test (gerçek kaynaklara istek atar, ağ gerekir)
npm run check         # lint + format:check + test (CI ile aynı)
npm run inspector     # MCP Inspector ile araçları tarayıcıda görsel test eder
```

**Test & Kalite:**
- `src/**/*.test.ts` altında ağ çağrısı yapmayan birim testleri bulunur (78 test): indikatörler, istatistik, Türkçe sayı ayrıştırma, cache/retry mantığı ve araçların saf yardımcı fonksiyonları.
- `scripts/smoke.mjs` sunucuyu gerçekten başlatıp 12 aracı canlı kaynaklardan çağırır.
- GitHub Actions: `ci.yml` her push/PR'da lint + format + derleme + test; `smoke.yml` main'e push'ta ve haftalık canlı test; `release.yml` `v*` etiketinde npm + GitHub release.

**Dayanıklılık:** Tüm kaynak çağrıları kaynak bazlı TTL'li bellek içi önbellekten geçer (kurlar 60 sn, makro 30 dk) ve ağ hatalarında jitter'lı üstel geri çekilmeyle 3 kez yeniden denenir. Sürekli hata veren bir kaynak için **devre kesici** devreye girer ve 45 sn boyunca anında bilgilendirici hata döner — böylece engellenmiş bir kaynağa istek atmak zaman kaybı yaratmaz. Durumu `get_data_health` ile görebilirsiniz.

**Proje yapısı:**
```
src/
  index.ts              # Sunucu kurulumu ve tüm araçların kaydı
  tools/                # Her araç için bir dosya (registerX)
  utils/
    yahoo.ts            # Yahoo Finance istemcisi (kotasyon/OHLC/arama, önbellekli)
    cache.ts            # TTL önbellek + jitter'lı yeniden deneme
    indicators.ts       # RSI, SMA, EMA, MACD, Bollinger, ATR
    financeMath.ts      # İstatistik ve portföy matematiği
    fetchWithRetry.ts   # Retry'lı + önbellekli HTTP isteği + hata yanıtı
    httpCircuit.ts      # Host bazlı devre kesici
    resolveTickers      # THYAO → THYAO.IS sembol çözümlemesi (yahoo.ts içinde)
    toolCatalog.ts      # finans://tools/catalog kaynağı
    financePrompts.ts   # Hazır soru şablonları (MCP prompts)
scripts/smoke.mjs       # Canlı smoke testi
```

## 📄 Lisans

MIT License © 2026 [metehan05-eng](https://github.com/metehan05-eng)
