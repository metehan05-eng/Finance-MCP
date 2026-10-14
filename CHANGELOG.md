# Changelog

Tüm notable değişiklikler bu dosyada belgelenir.
Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) — sürümleme: [SemVer](https://semver.org/lang/tr/).

## [1.6.1] — 2026-10-14

### Düzeltmeler
- `httpCircuit`: Devre kesici soğuma sonrası başarısız bir denemede artık yeniden açılıyor; ölü `markProbing` yolu kaldırıldı (devre eskiden yalnızca bir kez açılabiliyordu).
- `yahoo.resolveTickers`: Döviz çifti eşlemesi düzeltildi — `USD/TRY` artık `USDTRY=X` olarak çözülüyor (önceki hatalı `USD=XTRY`).
- `get_sector_performance`: Dönem aralıkları düzeltildi. `rangeMap` içindeki Yahoo aralıkları artık geçerli; getiri yalnızca ilgili `lookback` penceresi üzerinden hesaplanıyor (1d/5d/1mo/3mo/6mo/1y) — tüm dönemler eskiden 365 güne düşüyordu.
- `analyze_portfolio`: Gerçekleşmemiş getiri artık yalnızca **maliyeti bilinen** pozisyonlar üzerinden hesaplanıyor (maliyetsiz pozisyonların tüm değeri hatalı biçimde kâr sayılıyordu). TRY→USD kuru modül düzeyinden istek kapsamına taşındı (eşzamanlı çağrı yarışı giderildi).
- `backtest_portfolio`: Haftalık veride yıllıklandırma 52 dönemle yapılıyor (252 sabiti kaldırıldı); ortak tarih kesişimi boşaldığında artık sıfırlanmıyor (son sembol tek başına geçemez).
- `fetchWithRetry`: 429 yanıt gövdesi tüketiliyor (socket sızıntısı); son denemesi 429 ile biten istek devre sayacını artırıyor; ağ hatası deneme başına değil istek başına sayılıyor; `Retry-After` HTTP-tarih biçimini ve 30 sn üst sınırı destekliyor; çağıranın `signal`'ı `AbortSignal.any` ile korunuyor.
- `financeMath.parseTrNumber`: Binlik ayraç desteği (`1.650.074`, `1,650,074`), İngilizce biçim ve çoklu ayraç doğru çözülüyor.
- `xmlParser`: `Tarih_Date` kökü ve `Currency` düğümleri doğrulanıyor; bozuk/HTML gövdelerde açıklayıcı hata.
- `cache`: Önbelleğe alınmış `null` sonuç artık "önbellekte yok" sayılmıyor (`found` ayrımı).
- `watchlistStore`: Benzersiz geçici dosya adı (`pid` + `randomUUID`), hata halinde geçici dosya temizliği, dizin izni `0700`.

### Geliştirilen
- `toolCatalog`: Katalog, 44 aracın tamamını birebir kapsayacak şekilde yenilendi (7 birleşik ad ve `prompts` pseudo-girdisi kaldırıldı); `TOOL_CATALOG` dışa açıldı ve kataloğun kayıtlı araçlarla senkron olduğu testle doğrulanıyor.
- `financePrompts`: Var olmayan araç atıfları düzeltildi (`get_bist_price`→`get_bist_indices`, `get_global_market_summary`→`get_market_summary`, `get_stock_price`→`get_bist_price`/`get_global_stock_price`).
- `get_watchlist`: Sembol üst sınırı `MAX_WATCHLIST_SYMBOLS` (50) ile hizalandı (önceden 20).
- `save_watchlist`: `symbols` alanı isteğe bağlı yapıldı ve açıklamadaki `replace=add` yazım hatası giderildi.
- Tüm salt-okunur araçlara `readOnlyHint`/`openWorldHint` anotasyonları eklendi.
- `.cursor/mcp.json` taşınabilir `${workspaceFolder}` yoluna çevrildi; `SECURITY.md` paket `files` listesine eklendi.
- Test kapsamı 175 → 205 (`httpCircuit` yeniden açılma, `retryDelayMs`, katalog kompleliği, `commonDates`, `parseTrNumber`, null önbellekleme, xmlParser koruması, `forexTicker`, `analyze_portfolio` getiri + DI, `backtest_portfolio` DI). `all files` satır kapsamı %82,7 → %88,5.

### Değişti
- Sürüm: 1.6.1

## [1.6.0] — 2026-10-07

### Eklenen
- `get_crypto_movers`: CoinGecko ile 24 saat/7 gün en çok yükselen-düşen kriptolar, piyasa medyanı ve piyasa değeri filtresi (API key yok).
- `save_watchlist`: Kalıcı izleme listesini diske kaydeder (`replace` / `add` / `remove` / `clear`); atomik yazma, maksimum 50 sembol, dosya izni 0600.
- `get_watchlist` sembol verilmeden çağrıldığında kalıcı listeyi okur; `finans://watchlist` MCP resource'u kayıtlı listeye okuma erişimi verir.
- `analyze_portfolio` için sektör/endüstri kırılımı: `bySector`, `byIndustry`, ağırlıklı beta (kapsama yüzdesi), sektör yoğunlaşması ve %40+ yoğunlaşma uyarısı (`includeBreakdown` ile kapatılabilir).

### Geliştirilen
- `get_bist_indices`: Sektör endeksleri (XBANK, XUTEK, XGMYO, XILTM, XUSIN) benchmark (XU100) bazında sıralanır; göreli performans, önde/geride olan sektör ve doğrulanmış kod listesi döner. Yahoo'da karşılığı olmayan kodlar (XU015, XU010, XMESM, XKAGIT) bilinçli olarak çıkarıldı.
- `get_watchlist`: Büyük/küçük harf duyarsız tekilleştirme ve ilk yazımı koruma.
- `get_company_profile`: `summaryLength: 0` artık özeti gerçekten gizler.

### Düzeltmeler
- `fetchWithRetry`: Hata yanıtları (4xx/5xx) artık önbelleğe yazılmaz; `cacheDelete` ile temizlenir.
- Test kapsamı: DI tabanlı ağ yolu testleri (`get_watchlist`, `get_company_profile`, `compare_stocks`, `get_sector_performance`, `get_bist_indices`, `get_crypto_movers`) ve retry/429/5xx/devre kesici testleri eklendi; birim testi 175'e çıktı.

### Değişti
- Sürüm: 1.6.0

## [1.5.0] — 2026-10-03

### Eklenen
- `get_company_profile`: sektör, sanayi, ülke, çalışan sayısı, web sitesi ve iş özeti (BIST dahil).
- `compare_stocks`: 2-8 sembolü fiyat, değerleme (F/K, F/DD), ROE, temettü verimi, 52 hafta ve beta bazında karşılaştırır.
- `get_sector_performance`: 11 ABD sektör ETF'i üzerinden sektör performans sıralaması (1g-1y) + dünya endeksleri.
- `get_watchlist`: 20 sembole kadar izleme listesi; en çok yükselen/düşen ve yükselen-düşen dağılımı.
- MCP prompt şablonları: `market_morning_brief`, `stock_deep_dive`, `portfolio_review`, `data_source_diagnosis`.
- `resolveTickers` yardımcısı: "THYAO" → "THYAO.IS", "USD/TRY" → "USDTRY=X" çözümlemesi tek yerde toplandı.
- `get_technical_indicators` için `compact`, `get_stock_history` için `summaryOnly` parametreleri (token tasarrufu).

### Dayanıklılık
- Tüm kaynaklarda (sadece Yahoo değil) kaynak bazlı TTL önbellek: `fetchWithRetry` artık GET isteklerini önbelleğe alır.
- Host bazlı devre kesici (`src/utils/httpCircuit.ts`): üst üste hata veren kaynak 45 sn boyunca anında reddedilir.
- `get_data_health` artık açık devreleri, hata sayısını ve kalan süreyi raporlar; Yahoo probu 12 sn zaman aşımı kullanır.
- Smoke testi artık dayanıklı: her vaka 2 kez denenir, kritik olmayan kaynak hataları koşuyu düşürmez (`--strict` ile eski davranış).
- `compare_stocks` sembol çözümlemesi toplu quote + yalnızca eksikler için tek tek denemeye çevrildi (16 sn → 3 sn).

### Düzeltilen
- CI'daki haftalık smoke koşusu artık tek bir kaynak hatası yüzünden kırmızı olmuyor.

### Test
- 43 → 78 birim testi: devre kesici durum makinesi, TTL çözümleme, profil normalizasyonu, karşılaştırma satırı, sektör getirisi, izleme listesi sıralaması.

## [1.4.0] — 2026-10-02

### Eklenen
- `get_dividend_history`, `get_earnings_info`, `get_analyst_consensus`, `get_crypto_market_overview`, `get_data_health` (38 araç).
- TTL önbellek + jitter'lı üstel geri çekilme (`src/utils/cache.ts`), tüm Yahoo çağrılarına entegrasyon.
- `finans://tools/catalog` MCP kaynağı, Docker imajı, `smoke.yml` ve `release.yml` iş akışları.

## [1.3.0] — 2026-09-29

### Eklenen
- `get_technical_indicators`, `get_market_screener`, `backtest_portfolio` (33 araç).
- BIST 100, BIST endeksleri ve piyasa hareketleri araçları.