# Finance-MCP (Global & BIST Finans MCP Server)

Türkiye (BIST) ve global finans piyasalarına doğrudan erişim sağlayan açık kaynaklı bir **Model Context Protocol (MCP)** sunucusu. 

**Cursor, Claude Desktop ve Claude Code** gibi yapay zeka araçlarının; BIST hisselerine, küresel hisse senetlerine (NVIDIA, Apple, Tesla vb.), kripto para fiyatlarına, döviz kurlarına ve enflasyon verilerine canlı erişmesini sağlar.

> 💡 **Tüm veri kaynakları tamamen ücretsizdir ve herhangi bir API Key gerektirmez!**

---

## 🚀 Sunulan Araçlar (Tools)

| Araç | Açıklama | Kaynak |
| :--- | :--- | :--- |
| `get_bist_price` | BIST hisse senetlerinin güncel fiyatı, piyasa değeri ve 52h zirve/dip verileri (Örn: `THYAO`, `ASELS`) | Yahoo Finance |
| `get_global_stock_price` | Dünyadaki tüm hisseler (AAPL, NVDA, TSLA), endeksler (S&P 500, NASDAQ) ve ETF'ler | Yahoo Finance |
| `get_crypto_price` | Kripto paraların seçilen para birimi cinsinden güncel fiyatı, piyasa değeri ve 24s hacmi | CoinGecko |
| `get_multi_crypto_price` | Birden fazla kripto paranın fiyatını tek sorguda getirme (Örn: `bitcoin`, `ethereum`, `solana`) | CoinGecko |
| `get_exchange_rate` | İki para birimi arasındaki güncel veya geçmiş döviz kuru (Örn: `USD` -> `TRY`) | Frankfurter (ECB) |
| `convert_currency` | Belirli bir miktarı güncel kur üzerinden başka bir para birimine çevirme | Frankfurter (ECB) |
| `get_historical_rate` | 1999'dan itibaren belirli bir tarihteki döviz kuru | Frankfurter (ECB) |
| `get_tcmb_rate` | TCMB resmi bülteninden alış/satış kurları | TCMB XML |
| `get_inflation_data` | Türkiye TÜFE yıllık % enflasyon verisi | FRED / TÜİK |

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

Claude Desktop uygulamasını yeniden başlatın. Sağ altta çekiç (Tools) simgesinde **9 tool** aktif olarak görünecektir.

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

---

## 🛠️ Geliştirme

```bash
npm run dev         # Kod değişikliklerini izler ve otomatik derler
npm run inspector    # MCP Inspector ile araçları tarayıcıda görsel test eder
```

## 📄 Lisans

MIT License © 2026 [metehan05-eng](https://github.com/metehan05-eng)
# Finance-MCP
