# Changelog

Tüm notable değişiklikler bu dosyada belgelenir.
Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) — sürümleme: [SemVer](https://semver.org/lang/tr/).

## [Unreleased]

### Eklenenler
- Tüm JSON araç yanıtlarına kaynak, son başarılı veri zamanı, önbellek durumu ve yanıt üretim zamanı ekleyen ortak `_dataMetadata` alanı.
- TTL süresi dolan son başarılı HTTP/Yahoo yanıtı, kaynak yenilemesi başarısız olduğunda 24 saate kadar `stale` olarak kullanılabilir; stale kullanımı metadata içinde görünür.
- `get_data_health` kontrolleri HTTP 200'ün yanında kaynak yanıtının biçimini ve beklenen temel alanlarını doğrular; timeout sonuçlandıktan sonra zamanlayıcı temizlenir.
- Yahoo trend ve screener çağrıları da TTL önbelleği, stale fallback ve provenance takibine alındı.

## [1.7.0] — 2026-11-14

### Eklenenler
- `get_risk_metrics`: Tarihsel VaR/CVaR, maksimum düşüş ve zirveye dönüş tarihleri, Sharpe, Sortino, Calmar, yıllık volatilite, çarpıklık ve fazla basıklık.
- `get_seasonality`: Takvim ayı bazlı ortalama/medyan getiri, pozitif kapanma oranı, en iyi/en kötü yıl; veri boşluklarını atlayarak yanlış ay atfını önler.
- `get_insider_transactions`: Insider alım-satımları, net insider alım eğilimi, insider sahiplik oranı ve en büyük insider pozisyonları.
- `get_institutional_holders`: Kurumsal ve fon sahipliği, en büyük kurumlar, pozisyon değişimi ve sahiplik özeti.
- `get_etf_holdings`: ETF/fon en büyük holdingleri, sektör dağılımı, gider oranı ve dönemsel getiriler.
- `get_options_chain`: Opsiyon zinciri özeti — vadeler, ATM call/put, toplam açık pozisyon/hacim, put/call oranı ve en likit kontratlar.
- `get_rebalancing_plan`: Mevcut değerler + hedef ağırlıklardan al/sat planı; ağırlıkları normalize eder, yeni pozisyon/çıkış/nakit uyarıları verir.

### Geliştirilen
- `financeMath`: `percentile`, `skewness`, `kurtosis`, `downsideDeviation`, `maxDrawdown` yardımcıları eklendi ve test edildi.
- `yahoo`: Önbellek + yeniden denemeli `fetchOptions` sarmalayıcısı eklendi.
- `toolCatalog`: 51 araca senkronize edildi; katalog testindeki sabit sayım güncellendi.
- README araç tablosu ve sürüm bilgisi 1.7.0'a güncellendi.
- `smoke`: Beklenen araç sayısı 51'e çekildi; yeni araçlar ve `get_global_stock_price`/`get_fundamentals` için canlı vakalar eklendi.
- `analyze_portfolio`: Risk metrikleri artık sabit varsayımlar yerine son 1 yılın günlük USD getirilerinden hesaplanıyor (yıllık volatilite/getiri, Sharpe, maksimum düşüş; TRY varlıklar USD'ye çevrilir). Test kapsamı 243 → 246.

### Düzeltmeler
- `get_bist_price`, `get_global_stock_price`, `get_fundamentals`: Her çağrıda yeni `YahooFinance` örneği oluşturmak yerine ortak singleton, önbellek ve yeniden deneme sarmalayıcıları kullanılıyor (rate-limit dostu).
- `release.yml`: `NPM_TOKEN` iş düzeyine taşındı; adım koşulundaki `env.NPM_TOKEN` kontrolü artık gerçekten çalışıyor (önceden yayın adımı sessizce atlanabiliyordu).
- `SECURITY.md`: Desteklenen sürüm tablosu 1.7.0'a güncellendi.

### Değişti
- Sürüm: 1.7.0

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
