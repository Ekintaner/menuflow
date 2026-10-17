# CODEX-000 — MenuFlow ürün ve teknik planı

**Sürüm:** 1.0  
**Tarih:** 18 Ekim 2026  
**Durum:** Uygulama öncesi plan

## 1. Ürün hedefi ve kapsam

MenuFlow, restoran ve kafelerin müşterilerine masaya özel QR menü sunmasını, müşterilerin bu menüden sipariş vermesini ve çalışanların siparişleri yönetmesini sağlayan çok işletmeli bir SaaS ürünüdür.

**Kullanıcının kesinleştirdiği kararlar:**

- Her masanın kendine özel QR kodu olacak.
- Müşteri QR menüden sipariş verebilecek.
- Yönetim panelinden menü düzenlenecek ve siparişler takip edilecek.
- İşletme, ayarlardan otomatik sipariş kabulünü açabilecek.

**MVP için önerilen varsayımlar:**

- Bir tenant bir işletmeyi temsil eder; ilk sürümde işletme başına tek lokasyon vardır.
- Müşteri hesap açmadan sipariş verir.
- İlk dil Türkçe, varsayılan para birimi TRY olur. Para birimi işletme bazında saklanır.
- Ödeme işletmede yapılır; uygulama ödeme tahsil etmez.
- Yeni işletmelerde manuel kabul varsayılandır.
- İşletmeler başlangıçta kontrollü olarak sisteme alınır; herkese açık kayıt ve abonelik satışı sonraya bırakılır.

**MVP dışında:** online ödeme, fatura/POS entegrasyonu, teslimat, rezervasyon, stok miktarı takibi, ürün seçenekleri ve ekstralar, ortak masa adisyonu, çok şube ve abonelik faturalandırması.

## 2. Kullanıcılar ve temel akışlar

| Rol | Yetkiler |
|---|---|
| Müşteri | Menü görüntüleme, sepet oluşturma, sipariş gönderme, kendi siparişini takip etme |
| İşletme sahibi | Menü, masa, QR, sipariş, çalışan ve işletme ayarlarını yönetme |
| Çalışan | Sipariş görüntüleme ve izin verilen durum değişikliklerini yapma |

Platform işletmecisinin destek erişimi müşteri panelinden ayrılır; varsayılan olarak işletmelerin verilerine sınırsız erişim verilmez.

**Müşteri akışı:** QR okut → işletme ve masa bilgisini gör → menüyü incele → sepete ekle → fiyat ve toplamı doğrula → siparişi gönder → kabul ve hazırlık durumunu takip et.

**İşletme akışı:** Giriş yap → aktif siparişleri gör → manuel modda kabul/reddet → hazırlama, hazır ve teslim durumlarını ilerlet.

Siparişin sisteme ulaşması ile işletmenin kabul etmesi arayüzde ayrı gösterilir. Manuel modda ilk mesaj “Siparişiniz işletmenin onayını bekliyor” olur.

## 3. İşlevsel gereksinimler

### Müşteri ekranı

- Mobil uyumlu kategori ve ürün listesi.
- Ürün adı, açıklama, fiyat, isteğe bağlı görsel ve müsaitlik bilgisi.
- Adet değiştirme, sepetten çıkarma ve sınırlı uzunlukta sipariş notu.
- Göndermeden önce görünür işletme, masa ve toplam bilgisi.
- Fiyat değişmişse yeni toplamı göstererek yeniden onay alma.
- Başarısız bağlantıda sepeti koruma; sonucu belirsiz gönderimde aynı isteği güvenle yeniden deneme.
- Yalnızca ilgili müşteri oturumunun siparişlerine erişim.

### Yönetim paneli

- Kategori ve ürün oluşturma, düzenleme, sıralama ve arşivleme.
- Ürünü geçici olarak siparişe kapatma.
- Masa oluşturma, pasifleştirme, QR indirme ve QR yenileme.
- Masa, durum ve tarihe göre sipariş filtreleme.
- Bekleyen siparişler için görünür uyarı ve kullanıcı etkinleştirdiyse sesli bildirim.
- Manuel/otomatik kabul ve sipariş alımını durdurma ayarları.
- Sahip tarafından çalışan üyeliği yönetimi.
- Kritik değişikliklerde işlem geçmişi.

Ürün veya masa arşivlemek geçmiş siparişleri silmez. Gönderilmiş siparişin kalemleri değiştirilemez; MVP’de düzeltme, iptal ve yeni sipariş ile yapılır.

## 4. Teknik mimari

**Önerilen başlangıç yığını:**

| Katman | Tercih |
|---|---|
| Müşteri ve yönetim arayüzü | React + TypeScript + Vite |
| Statik yayın | Cloudflare Pages |
| Uygulama API’si | Cloudflare Worker, aynı site altında `/api/v1` |
| Veritabanı | Supabase PostgreSQL |
| Yönetici kimliği | Supabase Auth |
| Ürün görselleri | Supabase Storage |
| İlk sürüm güncellemeleri | Görünür ekranlarda kontrollü polling |

Akış: **Tarayıcı → uygulama API’si → yetkilendirilmiş veritabanı işlemi.**

Sipariş doğrulama, fiyat hesaplama ve durum geçişleri sunucuda yapılır. Sipariş oluşturma; sipariş, kalemler, ilk durum olayı ve tekrar önleme kaydını tek veritabanı transaction’ında yazar.

MVP’de ayrı mikroservis, Redis veya mesaj kuyruğu gerekmez. Gerçek zamanlı bildirim daha sonra eklenebilir; sipariş listesinin doğruluğu bildirime bağlı olmaz.

Yönetici sorguları kullanıcı kimliği ve RLS ile çalışır. Müşteri işlemleri dar kapsamlı sunucu işlemleridir; misafir oturumu doğrulanmadan veritabanına erişemez. Yükseltilmiş yetkili anahtarlar yalnızca sunucuda tutulur ve genel amaçlı sorgu uçlarında kullanılmaz.

## 5. Veri modeli

Kimlikler UUID, zamanlar UTC olur. İşletmenin saat dilimi ayrıca saklanır. Parasal tutarlar kuruş gibi en küçük para biriminde tam sayı olarak tutulur.

| Tablo | Temel alanlar ve amacı |
|---|---|
| `tenants` | Ad, slug, para birimi, saat dilimi, aktiflik |
| `tenant_settings` | Kabul modu, sipariş alımı açık/kapalı, sürüm |
| `memberships` | Tenant, kullanıcı, rol, üyelik durumu |
| `dining_tables` | Tenant, masa adı/numarası, aktiflik |
| `table_qr_tokens` | Tenant, masa, token özeti, sürüm, iptal zamanı |
| `guest_sessions` | Tenant, masa, QR sürümü, oturum özeti, sona erme |
| `categories` | Tenant, ad, sıralama, arşiv bilgisi |
| `products` | Tenant, kategori, ad, açıklama, fiyat, görsel, müsaitlik |
| `orders` | Tenant, masa, misafir oturumu, durum, toplam, para birimi, kabul modu anlık kopyası, sürüm |
| `order_items` | Tenant, sipariş, ürün referansı, ürün adı ve fiyat anlık kopyası, adet, satır toplamı |
| `order_events` | Tenant, sipariş, eski/yeni durum, aktör, gerekçe, zaman |
| `idempotency_records` | Oturum, anahtar, istek özeti, sipariş referansı, sona erme |
| `audit_logs` | Tenant, aktör, işlem, hedef, zaman; hassas veri içermeyen değişiklik özeti |

**Veri bütünlüğü kuralları:**

- Tenant’a ait tüm kayıtlarda `tenant_id` zorunludur.
- İlişkilerde `(tenant_id, id)` üzerinden birleşik foreign key kullanılır; başka işletmenin ürünü veya masası bağlanamaz.
- İşletme içindeki masa adı/numarası benzersizdir.
- Adet pozitif, fiyat negatif olmayan tam sayıdır.
- Sipariş toplamı sunucunun hesapladığı satır toplamlarından oluşur.
- Ürün adı ve fiyatı değişse bile geçmiş siparişin kopyaları korunur.
- Sipariş listeleri için `(tenant_id, status, created_at)` gibi erişim düzenine uygun indeksler oluşturulur.
- Sipariş oluşturma ile ilgili ayar ve ürün değişiklikleri transaction içinde tutarlı biçimde sıralanır; eşzamanlı değişiklik yarım sonuç üretmez.

## 6. Tenant izolasyonu

Tenant seçimi tek başına yetki vermez.

1. Yönetici kimliği doğrulanır; istenen işletmede aktif üyeliği ve işlem yetkisi kontrol edilir.
2. Üyelik veritabanından kontrol edilir; kullanıcının değiştirebildiği profil alanları yetki kaynağı olmaz.
3. Müşterinin tenant ve masası doğrulanmış QR oturumundan türetilir. İstek gövdesinden gelen değerler kullanılmaz.
4. Veritabanında tenant tabloları için RLS uygulanır. Güncelleme politikaları mevcut satıra erişimi ve yeni değerleri denetler.
5. Menü için yalnızca yayımlanabilir alanlar sunulur; siparişler, üyelikler ve iç notlar anonim erişime açılmaz.
6. Storage yazmaları tenant üyeliğiyle sınırlandırılır. Dosya yolundaki tenant adı tek başına yetkilendirme sayılmaz.
7. Önbellek anahtarları tenant ve menü sürümünü içerir; sipariş cevapları ortak önbelleğe alınmaz.

RLS, uygulama kontrollerine ek bir korumadır. Supabase’in dışarı açılan şemalarında RLS etkinleştirilmesi ve uygun politikaların tanımlanması gerekir. [Supabase RLS belgesi](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 7. API sözleşmesi

Tüm uçlar `/api/v1` altında JSON kullanır. Yönetici uçları kimlik doğrulaması ve rol kontrolü, müşteri uçları ilgili misafir oturumunu gerektirir.

| Metot ve yol | Davranış |
|---|---|
| `POST /guest-sessions` | QR token’ını doğrular, masaya bağlı misafir oturumu açar |
| `GET /menu` | Oturumun işletmesine ait menü, sürüm ve sipariş alım durumunu döndürür |
| `POST /orders` | Doğrulanmış sepetten sipariş oluşturur |
| `GET /orders/{id}` | Oturuma ait sipariş ve müşteri için uygun durum bilgisini döndürür |
| `GET /admin/orders` | Tenant kapsamında filtreli, cursor ile sayfalanmış liste |
| `GET /admin/orders/{id}` | Yetkili sipariş ayrıntısı |
| `POST /admin/orders/{id}/transitions` | Beklenen sürüm ve hedef durumla geçiş yapar |
| `POST/PATCH /admin/categories…` | Kategori oluşturma ve düzenleme |
| `POST/PATCH /admin/products…` | Ürün oluşturma, düzenleme ve arşivleme |
| `POST/PATCH /admin/tables…` | Masa oluşturma ve düzenleme |
| `POST /admin/tables/{id}/qr/rotate` | QR yeniler, eski QR ve bağlı oturumları geçersizleştirir |
| `PATCH /admin/settings` | Kabul modu ve sipariş alım ayarlarını günceller |
| `POST/PATCH /admin/memberships…` | Sahip tarafından çalışan üyeliği yönetimi |

**Sipariş oluşturma isteği:** ürün kimlikleri, adetler, isteğe bağlı not ve müşterinin gördüğü menü sürümü. `Idempotency-Key` başlığı zorunludur. Tenant, masa, durum ve hesaplanmış tutarlar istemciden alınmaz.

**Başarılı cevap:** sipariş kimliği, görüntüleme numarası, durum, para birimi, sunucunun hesapladığı kalemler/toplam, oluşturulma zamanı ve sürüm. İlk oluşturma `201`, aynı isteğin güvenli tekrarı aynı sipariş referansıyla `200` döner.

**Tekrar önleme:** Aynı oturum ve anahtar için aynı içerik aynı siparişi döndürür; farklı içerik `409 IDEMPOTENCY_CONFLICT` üretir. MVP’de anahtar kaydı 24 saat tutulur. Belirsiz ağ sonucunda istemci yeni anahtar üretmez.

**Hata biçimi:** `code`, kullanıcıya uygun `message`, isteğe bağlı alan hataları ve `request_id`.

| HTTP | Örnek |
|---|---|
| `400` | Bozuk istek |
| `401` | Eksik veya süresi dolmuş oturum |
| `403` | Rolün işleme yetkisi yok |
| `404` | Kayıt yok veya başka tenant/oturuma ait |
| `409` | Fiyat değişti, sipariş alımı kapalı, sürüm/geçiş çakışması |
| `422` | Geçersiz adet, boş sepet veya müsait olmayan ürün |
| `429` | İstek sınırı aşıldı; `Retry-After` döner |
| `503` | Geçici servis sorunu |

Başlangıç sınırları: en fazla 30 farklı kalem, kalem başına 20 adet, sipariş notunda 500 karakter. Liste uçlarında varsayılan 25, en fazla 100 kayıt.

## 8. Sipariş durum makinesi

| Mevcut durum | İzin verilen sonraki durum |
|---|---|
| Oluşturma — manuel kabul | `pending_acceptance` |
| Oluşturma — otomatik kabul | `accepted` |
| `pending_acceptance` | `accepted`, `rejected`, `cancelled` |
| `accepted` | `preparing`, `cancelled` |
| `preparing` | `ready`, `cancelled` |
| `ready` | `served`, `cancelled` |
| `served`, `rejected`, `cancelled` | Terminal; sonraki geçiş yok |

- Otomatik kabul “hazırlanıyor” anlamına gelmez.
- Kabul modu transaction sırasında okunur ve siparişe kaydedilir.
- Mod değişikliği önceki siparişleri etkilemez.
- Ret ve iptalde gerekçe zorunludur.
- Müşteri MVP’de doğrudan iptal yapmaz; işletmeyle iletişim kurar.
- Süre aşımı siparişi otomatik kabul etmez. Uzun bekleyenler panelde vurgulanır.
- Eşzamanlı iki işlemde sipariş sürümü kontrol edilir; yalnızca biri başarılı olur.
- Durum ve olay kaydı aynı transaction’da yazılır.

## 9. QR masa güvenliği

**Temel sınır:** Basılı sabit QR fotoğraflanıp paylaşılabilir. QR, müşterinin fiziksel olarak masada olduğunu kanıtlamaz.

MVP bu sınırı kabul eder; manuel kabul varsayılanıyla başlar. Otomatik kabul açılırken işletmeye bu davranış açıkça anlatılır.

- QR içinde sıralı masa kimliği yerine en az 128 bit rastgele token bulunur.
- Token’ın yalnızca kriptografik özeti veritabanında tutulur.
- QR doğrulandıktan sonra tenant ve masaya bağlı, önerilen dört saatlik misafir oturumu açılır.
- Oturum güvenli, `HttpOnly`, `Secure`, uygun `SameSite` cookie ile taşınır; yazma uçlarında Origin/CSRF kontrolü uygulanır.
- QR token’ı URL’den temizlenir; log, analitik ve yönlendiren başlıklarına sızması engellenir.
- Aynı QR’ı okutan iki müşteri birbirinin siparişlerini göremez.
- QR yenilenmesi eski token’ı ve ona bağlı oturumları iptal eder.
- Masa veya işletme siparişe kapatıldığında yeni sipariş engellenir; mevcut sipariş takibi sürer.
- IP, oturum ve masa bazında birlikte istek sınırlaması uygulanır. Ortak restoran Wi-Fi’si nedeniyle yalnızca IP’ye güvenilmez.
- Başlangıç sipariş sınırı oturum başına dakikada üç denemedir; masa sınırları pilot verisiyle ayarlanır.
- Token’lar ve müşteri notları uygulama loglarına yazılmaz.

Daha güçlü fiziksel doğrulama gerektiğinde çalışan tarafından açılan masa oturumu veya periyodik masa kodu sonraki aşamaya eklenebilir.

## 10. Test ve kabul kriterleri

| Alan | Geçme koşulu |
|---|---|
| Temel akış | QR → menü → sepet → sipariş → panel → teslim tamamlanır |
| Manuel kabul | Sipariş bekler; işletme işlemi olmadan kabul edilmez |
| Otomatik kabul | Yeni sipariş `accepted` oluşur; eski bekleyenler değişmez |
| Fiyat güvenliği | İstemcinin değiştirdiği toplam kullanılmaz; değişen fiyat yeniden onay ister |
| Tenant izolasyonu | A işletmesi; B’nin kayıtlarını ID, sorgu, yazma, dosya veya olay kanalıyla okuyamaz/değiştiremez |
| Müşteri izolasyonu | Aynı masadaki farklı oturumlar birbirinin siparişini okuyamaz |
| Tekrar gönderim | Aynı anahtarla eşzamanlı on istek tek sipariş oluşturur |
| Atomiklik | Kalem yazımı başarısızsa sipariş ve olay kayıtları da oluşmaz |
| Durum yarışları | Eşzamanlı çelişen geçişlerden biri başarılı, diğeri `409` olur |
| QR iptali | Eski QR ve bağlı oturumla yeni sipariş verilemez |
| Yetki iptali | Pasifleştirilen çalışan sonraki istekte erişemez |
| Ağ kesintisi | Arayüz siparişi doğrulama olmadan başarılı göstermez; yeniden deneme çoğaltmaz |
| Menü değişikliği | Ürün kapatma ve sipariş yarışı tutarlı sonuç verir |
| Erişilebilirlik | Mobil ekran, klavye kullanımı, etiketler ve hata mesajları doğrulanır |
| Geri yükleme | Yedek temiz ortama alınır; sipariş-kalem-olay ilişkileri korunur |

**Pilot performans hedefleri:** sıcak serviste, kontrollü test ortamında 50 eşzamanlı müşteriyle sipariş API’si p95 altında iki saniye; mobil menü kullanılabilirliği üç saniye; panelin yeni siparişi beş saniye içinde göstermesi. Bunlar ölçülecek hedeflerdir, hosting SLA’sı değildir.

İzolasyon, fiyat, tekrar gönderim veya veri bütünlüğü testindeki hata pilotu engeller.

## 11. Ücretsiz geliştirme ve hosting stratejisi

18 Ekim 2026 tarihinde kontrol edilen resmi kaynaklara göre:

| İhtiyaç | Başlangıç yaklaşımı | Sınır / karar |
|---|---|---|
| Geliştirme | Yerel araçlar ve yerel veritabanı | Gerçek müşteri verisi kullanılmaz |
| Arayüz | Cloudflare Pages | Statik dosya istekleri ücretsiz ve sınırsız; Functions ayrı kotaya girer |
| API | Cloudflare Workers Free | Günlük 100.000 istek, çağrı başına 10 ms CPU |
| Veritabanı/Auth/Storage | Supabase Free | 500 MB veritabanı, 1 GB dosya, 5 GB egress |
| Alan adı | Sağlayıcı alt alan adı | Özel alan adı sonradan bütçelenir |
| E-posta | Pilot için kontrollü hesap açılışı | Üretim davet ve parola sıfırlama e-postası ayrıca doğrulanır |

Kaynaklar: [Cloudflare Pages fiyatlandırması](https://developers.cloudflare.com/pages/functions/pricing/), [Workers fiyatlandırması](https://developers.cloudflare.com/workers/platform/pricing/), [Supabase fiyatlandırması](https://supabase.com/pricing).

Supabase Free projeleri bir hafta hareketsizlikten sonra duraklatılabilir; otomatik yedek ve uptime SLA’sı içermez. Ücretsiz katman geliştirme ve sınırlı pilot içindir; kesintisiz restoran operasyonu taahhüdünün temeli yapılmaz. [Supabase plan ayrıntıları](https://supabase.com/pricing)

Vercel Hobby kişisel ve ticari olmayan kullanımla sınırlı olduğu için ticari MenuFlow yayınının ücretsiz hosting temeli olarak seçilmez. [Vercel Hobby koşulları](https://vercel.com/docs/plans/hobby)

**Maliyeti kontrol etme:**

- Geliştirme yerelde, pilot ayrı bulut ortamında yürütülür.
- Görseller yüklemeden önce küçültülür; başlangıç üst sınırı 300 KB olur.
- Menü sürümlü önbellekle sunulur; gönderimde güncel veriler yeniden doğrulanır.
- Panel yaklaşık beş saniyede bir, aktif müşteri siparişi on saniyede bir sorgulanır. Gizli sekmelerde aralık uzar; terminal siparişlerde durur.
- Kota kullanımı haftalık izlenir; yüzde 70 seviyesinde kapasite değerlendirmesi yapılır.
- Pilot sırasında günlük şifreli veritabanı ve ayrı dosya yedeği alınır; geri yükleme denenir.
- Sürekli gerçek kullanıma geçişte yedekleme, erişilebilirlik ve kapasite için ücretli plan bütçesi açılır.

Ücretsiz servis kotası, bakım emeği ve özel alan adı gibi tüm maliyetlerin sıfır olduğu anlamına gelmez.

## 12. Sonraki CODEX aşamaları

| Aşama | Çıktı | Tamamlanma ölçütü |
|---|---|---|
| **CODEX-001** | Müşteri/panel ekran akışları, mimari karar kaydı, repo ve yerel çalışma temeli | İki arayüzün başlangıç yapısı çalışır; gerçek veri kullanılmaz |
| **CODEX-002** | Veri modeli, migration’lar, üyelik, tenant izolasyonu | İki sahte işletmeyle izolasyon testleri geçer |
| **CODEX-003** | Menü, ürün, görsel, masa ve QR yönetimi | Yönetici menü yayımlar; doğru masa menüyü açar |
| **CODEX-004** | Misafir oturumu, sepet ve güvenli sipariş API’si | Fiyat, tekrar gönderim, QR ve atomiklik testleri geçer |
| **CODEX-005** | Sipariş paneli, durum geçişleri, kabul ayarları | Manuel/otomatik kabul ve eşzamanlılık senaryoları geçer |
| **CODEX-006** | Uçtan uca testler, erişilebilirlik, kota ölçümü, yedekleme | Pilot çıkış kriterleri tamamlanır |
| **CODEX-007** | Tek işletmede kontrollü pilot ve operasyon rehberi | Gerçek masa akışı, kesinti toparlama ve geri bildirimler doğrulanır |
| **CODEX-008** | Pilot sonuçlarına göre ürünleştirme | Ücretli altyapı, abonelik, çok şube ve entegrasyon öncelikleri belirlenir |

Her aşama incelemeye uygun çıktı ve doğrulama sonucu üretir. Canlı yayın ayrı bir dağıtım adımıdır.

## 13. CODEX-000 tamamlanma tanımı

Bu plan; ürün kapsamını, rolleri, veri ilişkilerini, API davranışını, sipariş durumlarını, tenant ve müşteri izolasyonunu, QR güvenlik sınırını, test kapılarını ve hosting yaklaşımını tanımlar.

**İlk uygulama adımı CODEX-001’dir.** Başlamadan önce mevcut taslak varsayımlar ürün kararları olarak netleştirilir; bu aşamada kod, repo ve bulut kurulumu yapılmamıştır.