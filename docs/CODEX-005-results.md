# CODEX-005 — tenant yetkili restoran sipariş paneli

Tarih: 18 Ekim 2026. Temel commit: `52594b7` (CODEX-004). Önceki aşamalar korunur.

## Tamamlanan davranış

- `/admin` içinde Siparişler bölümü: aktif siparişler masa bazında gruplanır; onay bekleyenlerin sayısı ve iki dakikadan uzun bekleme uyarısı görünür. Kalemler, not, toplam, tarih, durum ve olay geçmişi gösterilir.
- Durum/masa/tarih filtreleri, aktif/geçmiş/tümü görünümü, cursor ile sayfalama. API varsayılan 25, en fazla 100 sipariş getirir. `(created_at,id)` cursor'ı PostgreSQL mikrosaniye hassasiyetini korur; tenant/tarih/masa indeksleri eklenir.
- Aktif owner/staff siparişi kabul/reddeder ve CODEX-000 durum makinesine göre ilerletir: pending → accepted → preparing → ready → served; uygun aşamalarda gerekçeli iptal. Ret/iptal gerekçesi zorunlu, terminal durumlar kapalıdır.
- Sipariş durumunu değiştiren dar RPC, özel şemadaki sabit search_path'li fonksiyona yönlenir. Canlı üyeliği kontrol edip üyelik satırını SHARE, siparişi UPDATE kilidiyle korur. Beklenen sürüm, durum ve gerekçe veritabanında yeniden doğrulanır. Durum/sürüm + aktör/gerekçeli olay + içerik taşımayan audit aynı transaction'da yazılır.
- Order/event/audit tablolarına authenticated doğrudan yazması kapalıdır. Liste/ayrıntı kullanıcı JWT'si ve RLS ile çalışır. Başka tenant ayrıntısı 404, aktif üyelik yoksa 403. Anonim kullanıcı RPC'yi çağıramaz. Public/private fonksiyon ACL'leri migration'da açıkça tanımlanmıştır.
- Sahip manuel/otomatik kabul ve sipariş alımını yönetir; çalışan yalnız ayarları görür. PATCH beklenen ayar sürümüyle çalışır; trigger sürümü artırır ve değişikliği denetler. Eşzamanlı güncellemede biri 200, diğeri 409 alır. Sipariş oluşturmanın mevcut SHARE kilidi ayar güncellemesiyle sıralanır. Yeni sipariş güncel modu snapshot olarak alır; eski sipariş değişmez. Otomatik kabul hazırlığa geçirmez; QR fiziksel konumu kanıtlamaz açıklaması formdadır.
- Panel görünürken tamamlanan istekten 5 saniye sonra tekrar sorgular; istekler üst üste bindirilmez. Gizli sekmede ağ isteği gönderilmez, 30 saniyelik kontrol aralığı kullanılır. 401/403 sonrası siparişler temizlenir ve polling durur. Hatalar görünür, çakışma sonrası güncel liste yüklenir. Tenant değişimi paneli yeniden kurar; önceki liste cevabı yeni tenant'a uygulanmaz.
- Guest order tracking aynı orders/order_events kayıtlarını okur; çalışan kimliği ve iç gerekçe misafire açılmaz. CODEX-004 fiyat/oturum/idempotency/immutable kalem ve atomik oluşturma kodu değiştirilmedi.

## Doğrulama

- 72 unit/API testi (önceki 44 + 28 yeni): rol/Origin/üyelik, sürüm/gerekçe/korunan alanlar, güvenli hata eşlemesi, ayar yetkisi/CAS, filtre sınırları ve mikrosaniyeli cursor.
- Gerçek PostgreSQL 17 geçici ağsız container: 325 PASS assertion/engellenen işlem kontrolü. Önceki izolasyon/QR/Storage/guest-order kontrolleri korunur. Yeni testler tüm 42 kaynak-hedef durum çiftini, aktör/audit atomikliğini, event ve audit yazımına zorla hata enjekte ederek geri almayı, tenant/rol/üyelik iptalini ve doğrudan yazma yasağını kapsar.
- Ayrı PostgreSQL bağlantılarında çelişen iki geçiş: tek kazanan, tek sürüm artışı, tek yeni olay/audit; kaybeden VERSION_CONFLICT. Ayar satırını kilitleyerek eşzamanlı sipariş oluşturma: yeni sipariş commit edilen otomatik modu görür, eski sipariş sürümü değişmez. Önceki on bağlantılı idempotency ve fiyat/müsaitlik yarışları da geçer.
- Gerçek yerel Supabase Auth/PostgREST/RPC/Storage entegrasyonu: owner/staff/başka tenant/guest, liste/ayrıntı/filtre/sayfalama, geçiş ve ayar yarışlarında 200+409, manuel snapshot'ın korunması, otomatik siparişin accepted oluşması, preparing/ready/served boyunca guest tracking, iç olay alanlarının gizliliği, doğrudan tablo yazma yasağı ve üyelik iptali. Test yalnız rastgele kendi fixture'larını temizler.
- 28 Playwright testi: masaüstü Chromium ve Pixel 7. Önceki 18 senaryo + çalışan teslim akışı, gerekçeli ret, çakışma sonrası yenileme, sahip ayarı/filtreler, polling/gizli sekme/yetki iptali. Tarayıcı testleri kontrollü HTTP cevapları kullanır; gerçek servis katmanı ayrı entegrasyon testinde doğrulanır. Mobil panel ekran görüntüsü görsel olarak incelendi.
- Lint, TypeScript/Vite build, Worker dry-run başarılı. npm audit: 0 açık. Yerel Supabase security/performance advisors: sorun yok. Migration listesi yerel DB ile uyumlu. Git whitespace kontrolü temiz.
- Migration CLI ile şemadan üretildi; ilgisiz extension kaldırma diff'i çıkarıldı, üreticinin atladığı function ACL'leri açıkça eklendi. Son dosya temiz PostgreSQL kurulumunda test edildi.

## Kapsam ve teslim

Ücretli servis, gerçek secret veya canlı deployment eklenmedi. CareerOS'a dokunulmadı. Sesli bildirim, pilot yük/operasyon/yedekleme kapıları CODEX-006 kapsamında kalır; liste uyarıları görseldir.

Başlangıçta uzak main kontrolü CODEX-004 `52594b7` commitinin zaten gönderilmiş olduğunu ve CI'ının başarılı olduğunu gösterdi. CODEX-005 ayrı yerel commit olarak hazırlanır; tüm yerel kontroller geçtikten sonra kullanıcı yetkisiyle normal push ve yeni commitin GitHub CI kontrolü yapılır. Son uzak/CI sonucu sohbet tesliminde raporlanır.
