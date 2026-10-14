# Güvenlik Politikası

## Desteklenen Sürümler

Güvenlik düzeltmesi yalnızca en son yayınlanan sürüm için sunulur.

| Sürüm | Desteklenir |
| ----- | ----------- |
| >= 1.6.1 | Evet |
| < 1.6.1 | Hayır |

## Güvenlik Açığı Bildirimi

Hassas veri veya gizli bilgi **içermeyen** her tür güvenlik açığını özel olarak
bildirmek için GitHub Güvenlik Danışmanlığı'nı
(https://github.com/metehan05-eng/Finance-MCP/security/advisories/new) kullanın.

Bildiren kişi aşağıdakileri mutlaka belirtmelidir:

- Etkilenen sürüm(ler)
- Güvenlik açığının türü (ör. SSRF, bilgi sızıntısı, zamanlama saldırısı)
- Mümkünse bir kanıt (PoC)

Yanıt süresi: ilk değerlendirme için en geç 72 saat.

## Kapsam dışı

Bu proje, tümü **API anahtarı gerektirmeyen** ücretsiz/kitlesel halka açık veri
kaynaklarını kullanır. Aşağıdakiler güvenlik desteği kapsamında değildir:

- Üçüncü taraf veri kaynaklarının (Yahoo Finance, TCMB, CoinGecko, vb.)
  kendilerindeki kesintiler
- Kullanıcının kendi istemci ortamında sakladığı/node_modules içindeki bağımlılık
  düzeyi açıkları (bunları Dependabot izler)

## Açıkların ifşası

Düzeltme yayınlanmadan önce bu depo veya npm paketi üzerinde genel ifşa
yapmayın.