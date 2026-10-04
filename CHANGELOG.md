# Changelog

Tüm notable değişiklikler bu dosyada belgelenir.
Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) — sürümleme: [SemVer](https://semver.org/lang/tr/).

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