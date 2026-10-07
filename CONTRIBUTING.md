# Katkı rehberi — Finance-MCP

## Geliştirme komutları

```bash
npm install
npm run dev        # watch modu
npm run check      # lint + format kontrolü + testler (CI ile aynı)
npm run smoke      # canlı kaynaklara istek (ağ gerekir)
npm run test:coverage
npm run build
```

Node.js >= 22 gerekir.

## Yeni araç eklerken

1. `src/tools/<aracAdi>.ts` içinde tek bir `registerX(server)` fonksiyonu yaz.
   - Girdi doğrulaması için `zod` kullan (`z.string().min(1)`, sınırlı `.max()`).
   - Her araç **salt okunur** olduğu için `{ readOnlyHint: true, openWorldHint: true }` ekle.
   - Hata durumunda `errorResponse(...)` döndür, `throw` etme.
   - Ağ çağrısını `src/utils/yahoo.ts` veya `fetchWithRetry` üzerinden yap; doğrudan `fetch` kullanma (önbellek/retry devre dışı kalır).
   - Sembol çözümü gerekiyorsa `resolveTickers(...)` kullan (`THYAO` → `THYAO.IS`).
   - Araç yazım/okuma yapıyorsa `{ readOnlyHint: false }` kullan (örn. `save_watchlist`).
   - Dış bağımlılıkları (`fetchX`, `resolveTickers`, depolama) `registerX(server, deps = DEFAULT_...)` imzasıyla al; varsayılanlar gerçek kaynak olsun.
2. Aynı dosyanın yanına `<aracAdi>.test.ts` yaz. Testler **ağ çağrısı yapmaz**:
   - Saf yardımcı fonksiyonları doğrular.
   - Ağ/dosya yolunu ise **sahte bağımlılık** (`deps`) vererek uçtan uca test eder; `fakeServer()` ile `server.tool(...)` kaydını yakala ve handler'ı doğrudan çağır.
   - Dosya sistemi kullanan kodda `FINANS_WATCHLIST_PATH` gibi bir env değişkeni ile yolu test dışına taşı (bkz. `src/utils/watchlistStore.ts`).
3. `src/index.ts` içine kaydet ve modül başlığına uygun yerleştir.
4. `src/utils/toolCatalog.ts` içindeki kataloğa aracı ekle (kategori, açıklama, 2 örnek soru).
5. `README.md` araç tablosunu güncelle; `CHANGELOG.md`'ye yeni sürüm başlığı ekle.
6. Smoke testine bir vaka ekle (`scripts/smoke.mjs`). Kritik kaynaklar `critical: true` olmalı.
7. Claude Code entegrasyonu `.mcp.json` + `scripts/claude-mcp.mjs` ile yapılır; başlatıcı build yoksa otomatik derler. Değişiklikten sonra `claude mcp get finans-mcp` ile yapılandırmayı doğrula.

## Commit ve PR kuralları

- Tek bir konuyu bir commit'te yap.
- Sürüm yükseltiyorsan `package.json` sürümünü de güncelle ve `CHANGELOG.md` yaz.
- PR açmadan önce `npm run check` ve `npm run smoke` yeşil olmalı.
- Canlı kaynaklara istek atan değişikliklerde smoke çıktısını PR açıklamasına ekle.

## Veri kaynakları kuralları

- API anahtarı gerektiren kaynak eklenmez.
- Yahoo'da karşılığı doğrulanmayan sembol/endeks kodunu listeleme; önce canlı olarak dene (bkz. `get_bist_indices` kod listesi).
- Her kaynağın `get_data_health` içinde bir probu olmalı.
- Veri gecikmeli/eksikse `dataNote` ile belirt; tahmin üretme.