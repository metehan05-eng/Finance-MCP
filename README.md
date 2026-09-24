# Finance-MCP (Global & BIST Finans MCP Server)

Türkiye (BIST) ve global finans piyasalarına doğrudan erişim sağlayan açık kaynaklı bir **Model Context Protocol (MCP)** sunucusu. 

**Cursor, Claude Desktop ve Claude Code** gibi yapay zeka araçlarının; BIST hisselerine, küresel hisse senetlerine (NVIDIA, Apple, Tesla vb.), kripto para fiyatlarına, döviz kurlarına, enflasyon verilerine, makroekonomik göstergelere, hisse geçmişine (grafik), VİOP/TEFAS verilerine ve finans haberlerine canlı erişmesini sağlar.

> 💡 **Tüm veri kaynakları tamamen ücretsizdir ve herhangi bir API Key gerektirmez!**

---

## 🚀 Sunulan Araçlar (25 Araç)

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

---

## 📦 Kurulum

Node.js (>= 22) yüklü olduğundan emin olun:

```bash
git clone https://github.com/metehan05-eng/Finance-MCP.git
cd Finance-MCP
npm install
npm run build
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

---

## 🛠️ Geliştirme

```bash
npm run dev         # Kod değişikliklerini izler ve otomatik derler
npm run inspector    # MCP Inspector ile araçları tarayıcıda görsel test eder
```

## 📄 Lisans

MIT License © 2026 [metehan05-eng](https://github.com/metehan05-eng)
# Finance-MCP
