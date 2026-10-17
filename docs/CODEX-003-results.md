# CODEX-003 — yönetim, menü ve masaya özel QR

Tarih: 18 Ekim 2026. CODEX-001 (`7aad8ce`) ve CODEX-002 (`301e5fd`) korunmuştur. Sipariş oluşturma CODEX-004 kapsamındadır.

## Tamamlanan davranış

- Supabase Auth ile kontrollü yönetici girişi/çıkışı. Access token yalnız HttpOnly cookie'de; refresh token istemciye verilmez. Oturum en fazla bir saattir, otomatik yenileme yoktur.
- Her yönetim isteğinde sunucuda `getUser`, aktif tenant/üyelik kontrolü ve kullanıcı JWT'siyle RLS. Düzenlenebilir kullanıcı metadata'sı yetki kaynağı değildir. Sahip yönetir; çalışan kayıtları salt okunur görür. Sahip mevcut hesaba çalışan üyeliği ekler/pasifleştirir; sahip rolü atayamaz.
- Kategori/ürün oluşturma, düzenleme, sıralama, arşivleme; ürün açıklaması, müsaitliği ve kesin tam kuruş fiyatı. Ürün kategorisi tenant birleşik foreign key'iyle korunur.
- Özel `menu-images` bucket'ı; en fazla 300 KB PNG/JPEG/WebP. API içerik türünü ve dosya imzasını kontrol eder; gövde boyutunu akış sırasında sınırlar. Tenant/sahip Storage politikaları, ürünle eşleşen dosya yolu, rastgele dosya adı, görsel değiştirme ve kaldırma. Menü görselleri beş dakikalık imzalı URL ile okunur.
- Masa oluşturma/düzenleme/pasifleştirme; PNG QR üretme/indirme/yenileme. 256 bit rastgele token, veritabanında yalnız SHA-256 özeti. Masa satırı kilidiyle atomik sürüm artırma, eski QR ve bağlı misafir oturumlarını iptal etme.
- Menü yayımlama/yayından kaldırma; varsayılan yayımlanmamış. Menü sürümü ve kategori/ürün/masa/üyelik/QR/yayın işlem geçmişi.
- Müşteri `/menu#TOKEN` bağlantısını açınca fragment temizlenir; QR yalnız istek gövdesinde Worker'a aktarılır. Cookie yalnız menü okuma yeteneğidir. Dar sunucu RPC'si, aktif QR/masa/tenant ve yayın durumundan doğru menüyü türetir. İstemci tenant/masa/fiyat belirleyemez. Arşivli kategoriler ve ürünler gizlenir; mevcut olmayan ürün işaretlenir.
- Aynı Origin yazma kontrolü; no-store/no-referrer cevapları; login ve QR okuma rate-limit bağları. Genel service-role sorgu ucu yoktur. Public RPC'ler security invoker'dır; yükseltilmiş QR işlemi non-exposed private şemada açık sahip kontrolüyle çalışır. Trigger fonksiyonları dışarıya kapalıdır.

## Doğrulama

- ESLint, TypeScript/Vite derlemesi, Worker dağıtımsız paketleme başarılı.
- 25 birim/API testi: giriş cookie'si, eksik/iptal üyelik, rol/Origin sahteciliği, geçersiz fiyat, mass assignment, kullanıcı JWT/tenant filtresi, hash QR ve kapalı sipariş ucu.
- Gerçek PostgreSQL 17 üzerinde 132 assertion/engellenen saldırı kontrolü: önceki izolasyon testleri ile yeni QR, yayın, fiyat, arşiv, Storage politikası ve yetki iptali senaryoları. Audit satırı sayısı varsayımı, işlem geçmişi eklenmesi nedeniyle tenant izolasyonunu denetleyecek şekilde güncellendi.
- 12 Playwright testi (masaüstü + Pixel 7): önceki demo sepet/kapalı sipariş akışı, yönetici kategori→ürün→görsel→masa→QR indirme→yayınlama, doğru masa menüsü, fragment temizleme/yenileme, geçersiz QR ve salt okunur çalışan ekranı. Yeni UI senaryolarında HTTP cevapları kontrollü test verisidir; mobil ekran görüntüleri görsel olarak kontrol edildi.
- Ek gerçek Supabase Auth/PostgREST/Storage entegrasyon akışı: iki tenant, üç gerçek yerel Auth hesabı, API üzerinden giriş ve veri yönetimi, özel görsel yükleme/imzalama/okuma/kaldırma, başka tenant görselinin reddi, QR iptali, çalışan iptali ve logout geçti. HTTP servisleri taklit edilmedi. Fixture'lar testin kendi rastgele UUID kayıtlarıyla sınırlıdır ve temizlenir.
- Supabase CLI 2.121.0 migration list: iki migration yerel servis veritabanıyla eşleşti. `db advisors --local --type all --level warn --fail-on error`: No issues found.
- Tam bağımlılık taraması: 0 açık. Supabase ve QR bağımlılıkları/CLI sürümleri lockfile ile sabitlendi. Sır içeren dosyalar takip edilmiyor.
- CI, yerel kontrollerin yanında gerçek Supabase entegrasyonunu ve advisors kontrolünü de çalıştırır. Buluta migration veya uygulama dağıtımı yapılmaz.

## Sınırlar ve sonraki aşama

CODEX-003 menü cookie'si bir sipariş/misafir oturumu değildir. `POST /orders`, müşteri sipariş takibi ve yönetici sipariş uçları kapalıdır. CODEX-004; ayrı misafir oturumları, sepet, atomik sipariş/fiyat hesaplama, idempotency ve sipariş rate-limit senaryolarını eklemelidir. İstemcide gösterilen fiyatın sipariş tutarı olarak kabul edilmesi mümkün değildir; henüz sipariş oluşturulmaz.

Yayımlanmış menü üzerindeki düzenlemeler hemen görünür; ayrı taslak sürümü yoktur. QR iptali sonraki menü isteğinde etkilidir. İndirilmiş içerik geri alınamaz; önceden verilmiş imzalı görsel URL'si beş dakika geçerli kalabilir. Auth logout tarayıcı cookie'sini temizler ve Auth oturumunu kapatır; çalınmış mevcut JWT için en fazla bir saatlik standart JWT süresi sınırı geçerlidir. Üyelik iptali her istekte canlı kontrol edilir.

İlk tenant/sahip ve hesaplar kontrollü platform işlemiyle açılır. Yerel servis testleri üretim SMTP, domain, kota veya yedekleme ayarlarını doğrulamaz. Canlı dağıtım bu aşamanın parçası değildir. CareerOS değiştirilmedi; ücretli servis veya bulut kaynağı açılmadı.

Kaynaklar: [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [sunucuda kullanıcı doğrulama](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage erişim kontrolü](https://supabase.com/docs/guides/storage/security/access-control), [Cloudflare rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). Güncel Supabase changelog/TLS değişikliği incelendi; modern Node/Workers istemcisini etkilemiyor.
