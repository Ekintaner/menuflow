# CODEX-006 — Production Readiness & Performance

18 Ekim 2026. Başlangıç: CODEX-005 `ea2ec58`; çalışma başlangıcında checkout temizdi. CODEX-000 incelendi. Ayrı yerel commit hazırlanır; push ve deployment yapılmaz.

## Sonuç

Yerel geliştirme/pilot hazırlık doğrulamaları tamamlandı. Gerçek müşteri verisi, ücretli servis veya gerçek secret eklenmedi; CareerOS'a dokunulmadı. Üretim yeterliliği ve kesintisiz operasyon garantisi verilmez. CODEX-007'de gerçek ortam doğrulamaları aşağıdaki açık kapılarla sürer.

## Düzeltmeler

- Müşteri polling'i önceki sabit interval yerine tamamlanan çağrıdan sonra planlanır; yavaş ağda üst üste istek göndermez. Terminal siparişleri tekrar sorgulamaz; 401/403/404 erişim kaybında durur; ayrılan bileşene eski yanıt uygulanmaz. Belirsiz gönderimin aynı anahtarla tekrar davranışı korunur.
- İlk gerçek panel ölçümü 5419 ms ile CODEX-000'in beş saniye hedefini kaçırdı. Görünür panel aralığı beşten dört saniyeye indi. Gizli panel 30 saniyelik kontrolde ağ isteği göndermez. Yeni yerel ölçüm 2837 ms; internet/servis gecikmesiyle her koşulda beş saniye garanti edilmez.
- Axe Playwright bağımlılığı tam sürüm `4.14.0` ile sabitlendi; lockfile güncellendi. Yeni polling/erişilebilirlik regresyonları CI'ın mevcut test komutlarına dahildir. Şema ve servis yetki kuralları değiştirilmedi.

## Doğrulama ve ölçüm

`npm run check`: lint, TypeScript, Vite build, 72 unit/API ve 32 Playwright testi geçti. Chromium masaüstü ve Pixel 7 emülasyonu; önceki 28 senaryo korunur, yavaş polling/oturum kaybı ve klavye/layout/terminal polling için dört proje koşusu eklenir. Ağ hatasında sepetin korunması ve aynı anahtarla retry, fiyat değişiminde yeniden onay, yetki iptali, ret, filtreler ve çakışma senaryoları geçer. HTTP kontrollü browser regresyonları gerçek servis entegrasyonundan ayrı tutulur.

`npm run test:integration`: gerçek yerel Supabase Auth, PostgREST, RPC, Storage ve PostgreSQL üzerinden tek kapsamlı senaryo geçti. Önceki tenant/role/guest izolasyonu, revocation, doğrudan yazma yasağı, idempotency ve geçiş yarışları korunur. Yeni test 50 ayrı guest oturumunu iki masaya (25/masa) dağıtır; 50 siparişi aynı anda başlatır. Worker handler Node içinde çalışır, veritabanı/API çağrıları gerçektir; Cloudflare rate-limit binding'leri bu yük testinde yoktur. DB masa/oturum sınırları etkindir. Aynı anahtarlı 50 replay + 50 takip çağrısı da birlikte çalışır ve yeni sipariş üretmez.

| Yerel ölçüm | Sonuç |
|---|---:|
| Eşzamanlı yeni sipariş | 50/50 başarılı, 50 farklı order |
| Sipariş p50 / p95 / maksimum | 77,6 / 122,3 / 125,0 ms |
| 50 sipariş tüm dalga | 130,9 ms |
| 50 müşteri durum sorgusu dalgası | 47,4 ms |
| 50 replay + 50 takip dalgası | 131,2 ms |
| Karma çift p95 | 115,6 ms |
| Mobil menü butonu kullanılabilir | 101,8 ms |
| Yeni siparişin panelde görünmesi | 2836,7 ms |

Ham kayıt: `docs/performance-006.json`. Bunlar tek kontrollü yerel örneklemdir; sustained soak, soğuk başlangıç, internet gecikmesi, düşük CPU telefon veya cloud shared compute testi değildir. API <2 s ve menü <3 s yerel hedefleri bu örnekte geçer. Karma test yeni sipariş + polling yerine replay + polling yüküdür; üretim yük modeli sayılmaz. Worker 10 ms CPU limiti wall-time ile ölçülmedi.

Ek gerçek tarayıcı testi: derlenmiş React arayüzünü yerel HTTP sunucusu üzerinden gerçek Worker handler ve Supabase'e bağlar. Pixel 7 müşterisi QR fragment → menü → sepet → manuel sipariş oluşturur; ayrı gerçek staff cookie oturumlu restoran paneli kabul/hazırlama/hazır/teslim işlemlerini UI üzerinden yapar. Her aşama müşteri sayfası yenilenerek aynı siparişin güncel durumu ve sunucu sürümü doğrulanır. İlk panel görünürlüğü gerçek polling ile ölçülür. Otomatik kabul ve polling davranışları ayrıca mevcut entegrasyon/regresyonlarda doğrulanır. Fiziksel kamera QR okuması bu test değildir.

Erişilebilirlik: gerçek menü ve sipariş panelinde axe `wcag2a`, `wcag2aa`, `wcag21aa` etiketleriyle sıfır otomatik ihlal; klavye Enter ile ekleme, adlandırılmış kontroller, canlı durum/hata alanları, yatay taşma kontrolü geçti. Gerçek mobil teslim ekranı görsel olarak incelendi. Tam WCAG sertifikası veya ekran okuyucu kullanıcı testi sayılmaz.

`npm run test:db`: mevcut 325 SQL kontrolü ve ayrı bağlantılarda idempotency/fiyat/müsaitlik/durum/ayar yarışları geçti. Ek temiz DB restore tatbikatında 4 sipariş, 4 kalem, 5 olay, 4 idempotency kaydı, sıfır kalem yetimi, 13 RLS tablosu ve 26 policy eşleşti; sipariş/kalem/olay içerik hash'leri de eşleşti. Tatbikat ağsız PostgreSQL 17 container'ında sentetik Auth/Storage şema karşılıkları kullanır; tam Supabase/Storage felaket kurtarması değildir.

Worker dry-run paketleme başarılı; canlı yayın değildir. npm audit sıfır açık. Yerel Supabase security/performance advisors sorun bildirmedi; dört migration yerel DB ile eşleşir. Git whitespace temiz. Secret taraması değişen dosyalar ve repo örüntüleri üzerinden gözden geçirildi; yerel anahtarlar gitignore dışında bırakıldı. Bu kontroller bağımsız penetrasyon testi değildir.

## Operasyon ve açık kapılar

[Pilot rehberi](pilot-operations.md) kurulum, rol, QR, kullanım, kesinti, tekrar gönderim, kota ve destek adımlarını; [yedek rehberi](backup-restore.md) şifreli günlük yedek, ayrı Storage, Auth/konfigürasyon envanteri ve temiz hedef restore prosedürünü içerir. Günlük otomatik yedek görevi kurulmadı; RPO/RTO gerçek veri hacminde ölçülmedi.

Resmi [Cloudflare limitleri](https://developers.cloudflare.com/workers/platform/limits/) ve [Supabase planı](https://supabase.com/pricing) kontrol edildi. 50 sürekli aktif müşteri + iki panel / 12 saat tahmini 237600 polling isteği/gün olup ücretsiz Worker 100000 kotasını aşar. Ücretsiz Supabase otomatik yedek sağlamaz. Ücretsiz katman yalnız sınırlı ve izlenen pilot için düşünülür; kapasite rehberde hesaplanır.

Supabase changelog tarandı: [eski TLS cipher kaldırımı](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) için eski cihaz kontrolü pilotta yapılmalı. [PostgreSQL minor değişimleri](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) incelendi; repo ltree/btree_gist veya legacy PGP şifreleme kullanmıyor. Canlı DB sürümü/extension doğrulaması deployment öncesi ayrıca yapılır.

CODEX-007 öncesi gerçek bulut CPU/kota ve ağ ölçümü, fiziksel QR/telefon testi, ekran okuyucu denemesi, SMTP/davet/parola sıfırlama ve tam Auth+Storage restore tatbikatı gerekir. Ücretsiz limitler altında sürdürülebilir eşzamanlılık gerçek kullanımda doğrulanmalı. Bu aşamada GitHub CI yeni commit için çalıştırılmadı; push kullanıcı onayını bekler.
