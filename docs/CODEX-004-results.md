# CODEX-004 — misafir sepeti ve güvenli sipariş

Tarih: 18 Ekim 2026. Temel commit: `f991c34`. CODEX-001/002/003 korunmuştur.

## Tamamlanan davranış

- QR token'ından ayrı, 256 bit rastgele HttpOnly/SameSite=Strict misafir cookie'si; HTTPS'te Secure. Token'ın yalnız SHA-256 özeti veritabanına gider. Süre dört saat; URL fragment temizlenir. QR yenilenince eski oturum geçersizleşir.
- Gerçek masanın yayımlanmış menüsünden ürün ekleme, 1–20 adet düzenleme/azaltarak çıkarma, en fazla 30 farklı kalem, 500 karakter not, görünür işletme/masa/toplam ve açık gönderim onayı.
- Menü sürümü değişirse sunucu 409 döndürür; arayüz güncel fiyatları getirir ve yeniden onay ister. Geçici/sonucu belirsiz ağ hatasında aynı anahtar ve payload saklanır; aynı sekmede sayfa yenilenince de aynı gönderim tekrar edilir. Sonuç doğrulanmadan başarı gösterilmez.
- `POST /guest-sessions`, oturumla `GET /menu`, `POST /orders`, yalnız oturuma ait `GET /orders/{id}`. Eski CODEX-003 salt okunur menü API'si uyumluluk için korunur; sipariş yetkisi vermez.
- Tenant, masa ve misafir kimliği sunucuda oturumdan türetilir. Menüdeki açık session_id siparişle cookie oturumuna eşleştirilir; başka sekmede QR/masa değişmesi bekleyen sepeti farklı oturuma taşıyamaz. Bu kimlik tek başına yetki vermez. İstemcinin tenant, fiyat, toplam veya durum alanları reddedilir. Ürün/kategori tenant'ı, arşiv/müsaitlik, masa/tenant aktifliği, yayın, sipariş alımı ve menü sürümü PostgreSQL'de yeniden doğrulanır. Tutarlar tam kuruşla hesaplanır; taşma reddedilir.
- Tek transaction: sipariş, immutable ürün adı/fiyat/adet kalemleri, ilk durum olayı ve idempotency kaydı. Kalem hatası tüm yazmaları geri alır. Masa/oturum kilitleri eşzamanlı tekrarları sıralar; kategori/ürün/ayar kilitleri değişiklik yarışlarında tutarlılığı korur. Kilitlenme/servis hatası güvenli yeniden denemeye açık 503 olur.
- Aynı oturum/anahtar/içerik aynı siparişi döndürür: ilk 201, tekrar 200. Farklı içerik 409. Kayıtlar en az 24 saat korunur; silme görevi eklenmedi. Oturum ömrü dört saat.
- Kabul modu sipariş oluşturulurken okunur ve snapshot saklanır. Manuel varsayılan `pending_acceptance`, otomatik `accepted`; geçmiş sipariş değişmez. Otomatik kabul hazırlık anlamına gelmez.
- Müşteri yalnız kendi siparişini ve güvenli olay alanlarını takip eder. Aynı masa, başka masa ve başka tenant oturumları 404 alır. Görünür sekmede 10 saniyelik polling; terminal durumlarda durur. Sipariş alımı/masa kapanması mevcut takibi kesmez; süre dolması veya QR/oturum iptali keser.
- Origin kontrolü, gövde sınırı, no-store/no-referrer, güvenli hata/request_id, Worker IP+oturum sınırları. Veritabanında oturum başına dakikada 3, masa başına 30 yeni sipariş; tekrarlar yeni sipariş kotasını tüketmez. Worker IP/oturum başına 30 gönderim denemesi/dakika uygular.
- Yeni RPC'ler security invoker, boş search_path ve yalnız service_role EXECUTE ile çalışır; anon/authenticated erişimi kapalı. Genel service-role sorgu ucu yoktur. İstemciye sunucu anahtarı veya oturum token'ı JSON olarak verilmez.

## Doğrulama

- 44 unit/API testi: cookie/hash güvenliği, Origin, oturum, mass assignment, sepet/adet/not sınırları, duplicate ürün, sunucu sonucu, tekrar cevapları, güvenli hata eşlemesi, özel sipariş erişimi ve throttling.
- Gerçek PostgreSQL 17 ağsız ve geçici container üzerinde 171 assertion/engellenen işlem kontrolü. Önceki tenant/RLS/Storage/QR testleri korunur; order_item güncellemeleri artık ek immutable trigger yüzünden P0001 ile engellenir.
- On ayrı PostgreSQL bağlantısının aynı anahtarla eşzamanlı isteği tek sipariş/kalem/olay/anahtar oluşturur. Ayrı bağlantıda kilit tutan fiyat ve müsaitlik güncellemeleriyle yarışan istekler MENU_CHANGED alır; kısmi sipariş oluşmaz.
- PostgreSQL testleri: aynı masadaki diğer misafir, aynı tenant diğer masa, diğer tenant izolasyonu; manuel/otomatik kabul; snapshot; arşivli ürün/kategori; taşma; kota; kapalı sipariş; süre/iptal; kalem yazımına zorla hata enjekte ederek atomiklik.
- Gerçek yerel Supabase Auth/PostgREST/Storage üzerinden önceki yönetim akışı + misafir oturumu + on eşzamanlı API isteği: bir 201, dokuz 200, tek sipariş kimliği; toplam 24690 kuruş. Başka misafir 404, anahtar çakışması 409, QR yenilenince 401. Yalnız testin rastgele tenant kayıtları temizlendi.
- 18 Playwright testi: masaüstü Chromium ve Pixel 7; önceki akışlar, gerçek sipariş API sözleşmesi, adet/not/sepet, kendi sipariş takibi/yenileme, belirsiz ağ sonucu sonrası aynı anahtarla tekrar, yeni fiyatla açık yeniden onay. UI testleri kontrollü HTTP cevapları kullanır; gerçek veritabanı entegrasyonu ayrı testtedir. Mobil sepet ekran görüntüsü görsel olarak doğrulandı.
- Lint, TypeScript/Vite build ve Worker dry-run başarılı. `npm audit`: 0 açık. Yerel Supabase security/performance advisors: sorun yok. Git whitespace kontrolü temiz.

## Kapsam ve sınırlar

CODEX-005'e restoran sipariş listesi/durum değiştirme paneli ve kabul ayarları arayüzü bırakıldı. Mevcut tenant ayarında sipariş alımı varsayılan kapalı; yerel test gerektiğinde açar. CODEX-006 pilot yük/erişilebilirlik/operasyon kapıları bu aşamanın kapsamı değildir.

Sabit QR fiziksel masada bulunmayı kanıtlamaz. İdempotency kaydı temizliği kurulmadı. Şema yerel MenuFlow Supabase'e uygulanıp doğrulandı; bulut migration/deployment yapılmadı. Gerçek secret, ücretli servis veya CareerOS değişikliği yok. Push kullanıcı onayına bırakılmıştır.
