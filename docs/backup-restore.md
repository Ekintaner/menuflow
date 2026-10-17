# Yedekleme ve geri yükleme prosedürü

18 Ekim 2026. Ücretsiz Supabase otomatik yedek sağlamaz. Veritabanı dump'ı Storage dosya içeriğini içermez. [Resmi rehber](https://supabase.com/docs/guides/platform/backups).

## Günlük yedek

Pilot sorumlusu kapanışta sipariş alımını durdurur ve açık işlemleri bitirir. PostgreSQL sürümü, migration listesi, uygulama commit'i, UTC zaman, son sipariş ve kayıt sayıları manifest'e yazılır. Günlük yedek için hedef RPO en fazla 24 saat; bu kabul edilmezse pilot başlamaz. RTO hedefi 60 dakikadır; gerçek veri hacminde henüz ölçülmedi.

Supabase CLI'de önce `supabase db dump --help` kontrol edilir. Güvenli bağlantı bilgisi operatörün secret deposundan alınır; komut geçmişine veya repoya yazılmaz. Resmi CLI ile roller (`--role-only`), şema (varsayılan) ve veri (`--data-only --use-copy`) ayrı dosyalara `--file` kullanılarak alınır. CLI varsayılan dışlamalarını özellikle Auth/Storage şemaları için kontrol edin: bunları kapsayan desteklenen proje taşıma prosedürünü izleyin; salt public dump'ı tam hesap yedeği saymayın. Auth kullanıcıları/üyelik UUID'leri korunmalıdır.

Storage nesnelerini ayrıca yetkili sunucu aracıyla indirin; bucket politikası/ayarları, tenant dizini, dosya adı, boyut ve SHA-256 listesi oluşturun. Veritabanı metadata'sı ile gerçek dosyaları eşleştirin. Auth konfigürasyonu, SMTP, Worker bindings ve secret'lar dump'ta değildir; ayrı şifreli envanter gerekir. QR baskılarını hassas erişim materyali olarak koruyun.

Yedekleri işletim sistemi şifreli diskte ve ikinci şifreli konumda tutun; anahtar ayrı saklansın. 7 günlük + 4 haftalık kopya pilot önerisidir; gerçek veri saklama politikası ayrıca belirlenir. SHA-256, okunabilirlik ve dosya sayısı doğrulanmadan “yedek başarılı” demeyin. Dump dosyalarını Git'e eklemeyin. Otomatik günlük görev bu aşamada kurulmadı; sorumlu günlük kaydı imzalar.

## Geri yükleme tatbikatı

1. Kaynağı değiştirmeyin. Aynı ana sürümde **yeni ve boş**, ağdan izole PostgreSQL veya ayrı test Supabase ortamı hazırlayın. Hedef adresi ve boşluğu iki kez doğrulayın. Canlı hedef üzerine restore bu rehberin yetkisi değildir.
2. Şifreli kopyayı kontrollü dizinde açın, manifest/hash doğrulayın. Roller/extension ve şema, sonra veri geri yüklenir. CLI'nin mevcut Supabase yönetilen rollerini yeniden oluşturmaya çalışmayın; resmi taşıma sırasını izleyin. `psql -X -v ON_ERROR_STOP=1` ile ilk hatada durun. PowerShell metin yönlendirmesinin encoding etkisinden kaçının; dosya argümanı veya byte güvenli aktarım kullanın.
3. Storage dosyalarını ayrı yükleyin; path/hash ve ürün görüntülerini kontrol edin. Auth kullanıcıları ve membership bağlantılarını doğrulayın. SMTP ve harici yan etkiler kapalı kalsın.
4. Tenant bazında orders/order_items/order_events/idempotency sayıları ve içerik hash'leri, toplamlar, FK yetimleri, RLS/policy/function ACL ve migration sürümünü karşılaştırın. İki tenant, staff/owner ve iki guest ile izolasyon regresyonlarını çalıştırın. Yalnız sayım eşitliği tam içerik doğrulaması değildir.
5. QR → sipariş → durum akışı, geçmiş, oturum süresi ve görsel erişimini deneyin. RPO/RTO, sorunlar ve operatörü kaydedin. Restore edilmiş eski idempotency/oturumlar kayıp siparişleri yeniden yaratabilir; gerçek kesintiden sonra masa/panel mutabakatı yapın, tüm oturumları ve gerekiyorsa QR'ları iptal edin.
6. Canlıya dönüş ayrı onay ve bakım penceresi gerektirir. Eski sistemin son salt okunur kopyasını saklayın; iki sistemde aynı anda sipariş kabul etmeyin.

## Bu aşamada kanıtlanan sınır

`npm run test:db`, ağsız geçici PostgreSQL 17'de sentetik Auth/Storage şema karşılıkları ve gerçek MenuFlow migration'larıyla çalışır. `pg_dump --no-owner` çıktısı aynı cluster içinde yeni `menuflow_restore` veritabanına yüklenir; sipariş/kalem/olay/idempotency sayıları, tenant FK yetimleri ve RLS tablo sayısı karşılaştırılır. Kaynak ve restore eşleşmezse test başarısızdır; container sonunda silinir. Gerçek Supabase Auth hesaplarının ve Storage dosyalarının felaket kurtarması bu testin kapsamı değildir; pilot öncesi ayrıca denenmelidir.
