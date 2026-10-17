# CODEX-002 — veri modeli ve yetki sınırları

Tarih: 18 Ekim 2026. CODEX-000 veri modeli esas alınır; CODEX-001 uygulama davranışı korunur.

## Uygulama

13 tablo tek transaction migration ile kurulur. Tenant altındaki bütün ilişkiler tenant_id içeren birleşik foreign key kullanır. Siparişin masası, misafir oturumunun masasıyla; idempotency kaydının oturumu, siparişin oturumuyla da eşleşmek zorundadır. Paralar tamsayı, adet 1–20, manuel kabul varsayılan, sipariş alımı başlangıçta kapalıdır. Silme kaskadı yoktur; geçmiş siparişe bağlı ürün ve masalar arşivlenmelidir.

Her tabloda ENABLE/FORCE RLS ve açık grant/revoke vardır. Anonim rol hiçbir tabloya erişemez. Aktif tenant içindeki aktif sahip/çalışan işletme verilerini okur. Sahip kategori/ürün/masa yönetir ve ayarları günceller. Çalışan için doğrudan yazma yoktur. Sipariş geçişleri sonraki aşamanın atomik işlemleriyle açılacaktır.

Sahip yalnız çalışan ekleyebilir, pasifleştirebilir ve silebilir. Rol, kullanıcı ve tenant kolonları güncellemeye kapalıdır. Sahip oluşturma/devretme kontrollü platform işlemidir; mevcut sahip kendisini silemez veya pasifleştiremez. Tenant oluşturma/pasifleştirme genel kullanıcı işlemine açılmaz.

private.has_role, RLS recursion önlemek için tek SECURITY DEFINER yardımcı fonksiyonudur. Non-exposed private şemada, sabit boş search_path ile ve tam nitelikli adlarla çalışır; sadece authenticated çalıştırabilir. Kimliği auth.uid() üzerinden alır ve güncel üyelik/tenant aktifliğini sorgular. İstemci user_id veremez, profil metadata yetki kaynağı değildir. Bu şema Data API exposed schemas listesine eklenmemelidir. Migration güvenilir yönetici rolüyle çalıştırılmalıdır; authenticated hiçbir nesnenin sahibi değildir.

QR/oturum hash tabloları ve idempotency kayıtlarında kullanıcı grant/policy yoktur. Oturum başına dört saat üst sınır ve QR sürüm ilişkisi veritabanındadır. QR rotasyonu, iptal denetimi ve misafir sipariş erişimi CODEX-004'te dar sunucu işlemleriyle uygulanacaktır. Service-role ile genel sorgu ucu yoktur.

## Tekrarlanabilir doğrulama

Docker çalışırken `npm run test:db`. PostgreSQL 17 Alpine imajı ilk seferde ücretsiz indirilir. Ağsız, dış portu olmayan, geçici container açılır; yalnız içinde yerel trust auth kullanılır. Bulut, gerçek kullanıcı, parola veya secret gerekmez. Başarılı/başarısız test sonrası container silinir. Mevcut veritabanlarına bağlanılmaz.

supabase/tests/bootstrap.sql yalnız test için Supabase auth.users/auth.uid ve rollerinin en küçük karşılığını sağlar. Üretime uygulanmaz. SQL testleri transaction sonunda rollback yapar. İzin kontrolleri SET ROLE authenticated/anon altında çalışır; FK saldırıları ise superuser ile RLS'den bağımsız doğrulanır. Bu bir gerçek PostgreSQL entegrasyon testidir; tam Supabase Auth/PostgREST/Storage uçtan uca testi değildir.

CI artık veritabanı testini de çalıştırır. Migration dosyası Supabase CLI migration new ile oluşturuldu. Doğrudan SQL migration temiz PostgreSQL üzerinde uygulandı; buluta migration push yapılmadı.

## Sonuçlar

- PostgreSQL 17: 105 başarılı assertion/engellenen saldırı kontrolü; iki tenant, sahipler, çalışan, üye olmayan ve anonim rol.
- Bütün 13 tabloda FORCE RLS; tenantlar arası okuma/yazma, bütün birleşik FK ilişkilerine saldırılar, rol yükseltme, metadata sahteciliği, boş kimlik, çalışan yazmaları ve anlık üyelik iptali doğrulandı.
- ESLint, TypeScript/Vite derlemesi, 7 birim ve 4 tarayıcı testi geçti.
- Worker dağıtımsız paketleme geçti; npm audit: 0 açık.
- Supabase db advisors --type all --level warn --fail-on error: No issues found (temiz yerel PostgreSQL, yalnız loopback bağlantısı). Bu sonuç canlı Supabase servis ayarlarını kapsamaz.
- Güncel Supabase changelog kontrol edildi; ilgili TLS değişikliği mevcut modern Node/Workers mimarisini değiştirmiyor.

## Kalan aşamalar

CODEX-003: menü/masa API ve yönetim ekranları. CODEX-004: QR, cookie/CSRF, misafir oturumu, atomik sipariş/fiyat hesaplama/idempotency. CODEX-005: transaction içinde durum geçişleri, olay ve audit yazımı, sürüm/yarış testleri. Gerçek Auth giriş akışı, Storage ve servis bazlı uçtan uca izolasyon testleri ilgili aşamalarda zorunludur. Migration tek başına bu akışları açmaz; mevcut iş uçları kapalıdır.

İlk tenant/sahip yalnız kontrollü yönetici provisioning ile oluşturulur. Canlıya geçmeden önce Supabase üzerinde migration uygulama, gerçek Auth/PostgREST grant/RLS doğrulaması ve yedek/geri yükleme kontrolü yapılmalıdır.

GitHub remote tanımlı değildir. CODEX-001 korunur, CODEX-002 ayrı commit'tir. Hedef GitHub depo adresi doğrulanmadan push yapılmaz.

Kaynaklar: https://supabase.com/docs/guides/database/postgres/row-level-security ve https://supabase.com/changelog.md
