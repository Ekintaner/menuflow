# CODEX-007 — Örnek restoran pilotu ve kabul defteri

18 Ekim 2026. Kullanıcının seçimi: şimdilik örnek restoran. Gerçek işletme onboarding'i, hesap yetkisi, dış URL ve canlı sipariş onayı yok. Kurgusal katalog: [demo-catalog.json](demo-catalog.json). Bu dosya veriyi otomatik hiçbir ortama yüklemez.

## Platform ekranı

`/platform-demo`: hesap gerektirmeyen, yalnız tarayıcı belleğinde yaşayan örnek kontrol ekranı. MenuFlow Demo Kafe ve 4 masa ile başlar. Restoran ekle, masa ekle, masa QR PNG indir ve QR kartını yazdır akışları denenebilir. Yenileme örnek değişiklikleri siler. Demo QR açıkça demo olarak işaretlidir ve yalnız örnek platform ekranını açar; gerçek sipariş menüsüne bağlı değildir. İnternete yayınlanmadı.

`/platform`: ayrı platform yönetimi. Aynı kontrollü Auth girişini kullanır; sunucu her istekte getUser ile doğrular ve kimliği yalnız PLATFORM_ADMIN_USER_ID ile birebir karşılaştırır. Restoran sahibi/staff rolü, e-posta adı veya editable user_metadata erişim sağlamaz. Ayar boşken API kapalıdır. UUID yalnız gerçek kullanıcının hesabı doğrulandıktan sonra secret olarak girilir. Parola veya API secret'ı tarayıcıya verilmez. 1 saatlik oturum sonrası tekrar giriş gerekir; ayrı MFA arayüzü yoktur. Platform hesabına güçlü parola ve kontrollü erişim gerekir; dashboard MFA ile uygulama MFA'sını aynı şey saymayın.

İlk sürüm: restoran adı/kısa adı, mevcut masa sayısı, TRY ve Europe/Istanbul; 1–100 başlangıç masası, toplam 100'e kadar ek masa. Mevcut restoranlar 50'lik cursor ile listelenir. Restoran sahibi Auth UUID'si isteğe bağlıdır; boşsa platform yöneticisi ilk sahip olur ve `/admin` üzerinden menü kurabilir. Sahip hesabı önceden kontrollü açılmalıdır; platform kullanıcıya e-posta göndermez. Toplu restoran silme, sahip devir ekranı, faturalama, tüm siparişleri platformdan izleme ve otomatik müşteri onboarding'i kapsam dışıdır. Restoran adı/zaman dilimi düzenleme ve masa azaltma bu sürümde yok; masa kapatma mevcut restoran panelindedir.

Oluşturma; tenant, settings, owner üyeliği ve masaları tek transaction'da yazar. Eksik sahip UUID'si veya çakışan slug yarım restoran bırakmaz. Yeni restoran manuel kabul + sipariş kapalı + menü yayımlanmamış halde başlar. Platform yazmaları audit actor/action kaydı üretir. QR yenileme tablo kilidi altında eski QR ve guest oturumlarını iptal eder; yalnız token özeti DB'ye yazılır. Ham QR yalnız yanıtta bir kez gösterilir, log'a yazılmaz. PNG kaybolursa eski baskıyı iptal ederek yenileyin. QR üretilmesi menüyü yayımlamaz veya siparişi açmaz.

Masa eklemede ağ sonucu belirsizse tekrar basmadan önce restoranı yeniden yükleyip mevcut sayıyı kontrol edin; bu yönetim işlemi sipariş endpoint'inin idempotency sözleşmesini kullanmaz. QR yenileme sonucu kaybolursa aynı token yeniden alınamaz; kontrollü yeni yenileme gerekir.

## Örnek onboarding provası

1. Yerel `/platform-demo` ekranında 4 masalı örnek restoranı seçin. İkinci bir örnek restoran oluşturup 2 masa daha ekleyin. Doğru işletme ve masa başlığıyla QR kartını indirin/yazdırın. Bu örnek kartı gerçek işletme masasına koymayın.
2. Yetkili yerel/staging gerçek servis provasında kontrollü platform hesabıyla `/platform` kullanın. Restoranı 4 masa ile oluşturun; gerçek sahibi yokken ilk sahip siz olun. Katalogdaki 2 kategori ve 4 ürünü `/admin` üzerinden girin. Fiyatlar tam kuruş: Çay 4000, Türk Kahvesi 9000, Kaşarlı Tost 15000, Günün Tatlısı 12000 (kapalı). Görsel zorunlu değil.
3. Restoran panelinde menüyü yayımlayın; masa QR'larını platformda üretip anında indirin. Her kartta işletme ve masa adı görünmeli. Basılı QR fiziksel olarak ilgili masada okutulmalı. Kamera tarama veya QR baskısı tarayıcı emülasyonuyla kanıtlanamaz.
4. İki Çay + bir Tost toplamı 23000 kuruş / 230 TRY olmalı. Test notu yalnız "Demo: servis denemesi"; kişi/telefon/sağlık bilgisi yok. Global alım ve tenant alım ayarını kontrollü prova için açın. İş bitiminde kapatın.
5. Gerçek restoran aşamasına geçişte işletme adı/adresi, sorumlu kişi, owner hesabı, masa adedi, vardiya saatleri, menü/fiyat ve alerjen doğruluğu, destek telefonu, yedek sorumlusu ve hukuki metin sorumlusu kullanıcıdan alınır. Bilgiler uydurulmaz; bu aşamada alınmadı.

## Gerçek cihaz deneme matrisi (henüz yapılmadı)

En az bir güncel iPhone Safari, Android Chrome ve mümkünse düşük donanımlı/eski Android; restoran paneli için tablet/dizüstü. Her biri için OS/browser sürümü, ağ, saat, testçi ve sonuç kaydedilir. Mobil Wi-Fi ve hücresel ağ ayrı denenir. Özel test hesabı ve sentetik veriler kullanılır; video/screenshot cookie veya QR token'ı göstermemeli.

| Deneme | Beklenen sonuç / kanıt |
|---|---|
| Fiziksel basılı QR, Masa 1 ve Masa 2 | Kamera doğru menüye açar, işletme/masa adı eşleşir; fragment temizlenir |
| QR → 2 Çay + Tost → gönderim | 230 TRY, manuel onay bekliyor; ayrı panelde tek sipariş |
| Panel kabul → hazırlama → hazır → teslim | İlgili müşteri durumu doğru; başka telefon aynı siparişi göremez |
| Yanlış masa/iptal QR | Yeni QR veya görevli yönlendirmesi; başka masaya sessiz sipariş yok |
| Aynı anda iki telefon, aynı masa | Sepet/oturumlar ayrıdır; birbirinin siparişine erişim yok |
| Ağ gönderim sırasında kesilip gelir | Sahte başarı yok; aynı sekmede aynı gönderim tekrar, tek order |
| Yenileme, arka plan, ekran kilidi, geri dönüş | Belirsiz sepet korunur, terminal polling durur; görünür panel zamanında yenilenir |
| Fiyat değişikliği / ürün kapalı | Güncel fiyat tekrar onay ister; kapalı ürün yeni siparişe girmez |
| Staff yetki iptali / 1 saat sonra giriş | Sonraki istekte erişim kalkar veya tekrar giriş gerekir |
| Ret/iptal/otomatik kabul | Gerekçe zorunlu; otomatik accepted hazırlama değildir; önceki sipariş değişmez |
| Menü/panel yavaş internet | Sıcak sipariş p95 <2 s, menü kullanılabilir <3 s, panel görünürlüğü <5 s hedefleri ölçülür |
| Ses/ekran okuyucu/klavye | VoiceOver/TalkBack ile kontroller ve hatalar anlaşılır; sesli alarm yok, çalışan paneli izler |
| Yeni QR basma ve eskisini çıkarma | Eski QR ve bağlı oturumlar iptal; mevcut siparişler panelden mutabakat edilir |
| Worker global alım durdurma / tenant kapatma | Yeni sipariş reddedilir; mevcut takip ve restoran işlemleri çalışır |

Performans en az 20 normal siparişte p50/p95 ve hata sayısıyla kaydedilir; eşzamanlı 50 testi ancak ayrı staging'de hesap kotası ve kullanıcı onayı sonrası yapılır. Cloudflare CPU limiti ayrıca Dashboard ölçümüdür. Hedef tutmazsa kapsam küçültülür veya pilot ertelenir; yerel sonuçlar yerine yazılmaz.

## Vardiya ve gözlem

Başlamadan 30 dakika önce: proje pause/kota, owner/staff giriş, masa QR, ürün fiyatı, son yedek doğrulaması ve örnek sipariş. Sipariş alımı ancak sorumlu çalışan panel başındaysa açılır. Pilot önerisi tek restoran / 4 masa / en çok 5 aktif müşteri siparişi / 4 saat. İlk 30 dakika 10 dakikada, sonra saatte bir operasyon kontrolü; her vardiya sonunda kota/backup kaydı. Otomasyon/hatırlatıcı kurulmadı.

`pilot-observations.csv` şablonunda UTC zaman, ortam/commit, sentetik restaurant code, aktif sipariş/panel sayısı, toplam API çağrısı, 4xx/5xx/429, p95 wall-time, panel gecikmesi, Worker CPU p95, DB/Storage/egress ve yedek/restore sonucu tutulur. Boş alan ölçülmedi demektir; sıfır değildir. Not alanına sipariş içeriği, kişi adı, IP, e-posta, cookie veya QR girilmez. Destek için request_id ve saat yeterli. Health başarı oranı sipariş başarı oranının yerine geçmez. Testin ürettiği docs/performance-006.json dosyası önceki yerel ölçüm formatıdır; bulut kapasite kanıtı değildir.

Kritik hata: tenant/guest izolasyonu, fiyat/atomiklik, birden çok sipariş, kayıp sipariş, secret sızıntısı → hemen global/tenant alım kapalı, kâğıt sipariş, olay sorumlusu, mutabakat. 5 dakika boyunca >%1 5xx, sürekli >5 s panel gecikmesi, tekrarlayan 429 veya kota ≥%85 → yeni alım kapalı; neden çözülmeden yeniden açılmaz. Bunlar pilot iç eşikleridir, izleme sistemi tarafından otomatik uygulanmaz. %70 kaynak kullanımında yeni katılımcı eklemeyi durdurup kapasite/egress hesabını yenileyin.

## Rollback ve veri kurtarma

Önce alımı kapatın; DB erişilemiyorsa global Worker anahtarını kapatın ve restoran manuel akışa geçsin. İşlem sonucu belirsiz müşterileri masa/panelle tek tek doğrulayın; yeni QR/sekmeden yeniden gönderim önermeyin. Olay saati, commit ve request_id kaydı alın; QR/not/cookie log'u tutmayın.

Uygulama rollback'i veri restore'u değildir. Onaylı bakım penceresinde Pages'in önceki doğrulanmış deployment'ını ve ona uyumlu Worker sürümünü birlikte geri alın; binding ve secret'ların hangi sürüme ait olduğunu tekrar kontrol edin. Şemayı otomatik aşağı migration ile silmeyin. CODEX-007 migration'ı eklemelidir; CODEX-006 uygulamasına dönüldüğünde fonksiyon kullanılmaz, veri korunur. Platform erişimini kapatmak için PLATFORM_ADMIN_USER_ID kaldırılabilir; service-only RPC grant'leri ayrıca operatör kontrolündedir. Tenant/order/QR/audit kayıtlarını rollback amacıyla silmeyin.

Veri bozulması/kaybında [backup-restore.md](backup-restore.md) uygulanır: kaynak korunur, şifreli dump + Storage dosyaları + Auth UUID/konfigürasyon manifest'i **yeni boş hedefe** alınır, hash/FK/RLS ve QR-sipariş akışı doğrulanır. Platform admin UUID de Auth kurtarma manifest'ine dahildir; hesap yeniden yaratılırsa UUID farklı olabilir, açık onayla yeni doğru UUID tanımlanır. Yedek kayıp siparişleri geri getirmez; restore sonrasındaki siparişler masa/kâğıt kayıtlarından mutabakat edilir. Eski oturum/idempotency replay riskine karşı oturum/QR iptal stratejisi uygulanır. İki sistem aynı anda sipariş kabul etmez. Canlı yön değişimi ayrıca onay ister.

Öneri RPO ≤24 saat, RTO ≤60 dakika; gerçek işletme bunları kabul etmeden pilot başlamaz. Günlük kapanış backup sorumlusu ve ikinci şifreli konum atanmadı. 7 günlük + 4 haftalık yedek önerisi ve aşağıdaki saklama taslağı gerçek işletme tarafından kesinleştirilmeli. Tam Auth+Storage restore tatbikatı açık; PostgreSQL sentetik restore bunun yerine geçmez.

## Gizlilik ve KVKK hazırlığı

Bu bölüm işletmeye özel hukuki metnin yerini almaz; tamamlanacak somut hazırlıkları tanımlar. [KVKK aydınlatma rehberi](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-) uyarınca veri sorumlusu, amaç, hukuki sebep, alıcı grupları, toplama yöntemi ve ilgili kişi hakları gerçek akışa göre belirtilmelidir. Veri sorumlusu/işleyen rolleri restoran ve platform arasında yazılı netleşmeli; işletme bilgileri olmadan son metin yayımlanmaz. Aydınlatma, açık rıza ve kullanım koşulu tek kutuda birleştirilmez.

Veri envanteri: Auth çalışan e-posta/UUID; tenant/masa; sipariş kalem/fiyat/durum/not; olay ve audit aktörü; guest ve QR hash'leri; cookie; sağlayıcının IP/teknik logları; ürün görselleri. Müşteri hesabı/adı/telefonu istenmez. Sipariş notuna sağlık/alerji gibi hassas içerik yazılmaması için pilotta serbest not kullanılmaz; alerjen sorusu görevliye yönlendirilir. Görsellere kişi veya EXIF kişisel veri eklenmez. Analitik/pazarlama pikseli eklenmedi; sağlayıcı logları ayrıca kontrol edilir. Gerekli cookie ve sekme deposu amaç/süreleri metne dahil edilmeli.

Taslak saklama: sentetik demo kayıtları test sonrası temizlenir; guest/idempotency kişisel veri eşleşmeleri kısa tutulur fakat idempotency 24 saat dolmadan ve bağlı orders FK değerlendirilmeden silinmez. Gerçek sipariş/audit kayıtları için işleme amacı ve yasal saklama yükümlülüğü belirlenmeden otomatik süre uydurulmaz. Pilot önerisi ham teknik destek kayıtları 7 gün, erişimi sınırlı operasyon özeti 30 gün; restoran/hukuk sorumlusu onayı gerekir. Otomatik retention/anonimleştirme görevi yoktur ve UI'da kişisel veri talebi aracı yoktur. Silme talebi ilişkili kayıtlar ve yedek süreleriyle kontrollü operatör akışında ele alınır; keyfi cascade DELETE uygulanmaz.

Cloudflare/Supabase region, alt işleyen ve DPA koşullarını kaydedin. Avrupa region seçmek Türkiye dışına aktarım değerlendirmesini ortadan kaldırmaz. [KVKK yurt dışına aktarım](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim) kapsamında uygun hukuki mekanizma uzmanla belirlenmeli; standart sözleşme gerekiyorsa imza/bildirim süreci gerçek taraflarla tamamlanır. Metin, destek irtibatı, veri taleplerinin doğrulanması, incident bildirimi sorumlusu ve erişim listesi hazır olmadan gerçek veri toplanmaz. Son aydınlatma metninin menü/giriş ekranına eklenmesi gerçek işletme bilgisi sonrası açık iştir; bu aşamada sahte metin eklenmedi.

## Kabul ve durum

| Kapı | Mevcut durum | Canlı pilot için şart |
|---|---|---|
| CODEX-006 remote/CI | main f950437; GitHub CI başarılı | Yeni CODEX-007 push ayrıca onay, sonra kendi CI'ı |
| Yerel fonksiyonel/güvenlik testleri | CODEX-007-results.md kanıtları | Hepsi geçmeli |
| Örnek platform/restoran/masa/QR | Yerel demo ve gerçek servis entegrasyonu | Gerçek tek yönetici UUID'si doğrulanmalı |
| Cloud config/binding/closed orders | Dosyalar ve dry-run hazır | Hesapta staging smoke + CPU/kota doğrulaması |
| Gerçek cihaz ve fiziksel QR | Yapılmadı | Yukarıdaki matris imzalı geçmeli |
| Onboarding/operatör | Örnek senaryo hazır | Gerçek sorumlu, vardiya, menü doğruluğu, manuel fallback |
| SMTP/reset/davet | Prosedür taslağı; gerçek akış doğrulanmadı | Kontrollü hesap kurtarma kanıtı |
| Auth+Storage recovery | PostgreSQL restore dışında açık | Yeni hedefte tam tatbikat, RPO/RTO kaydı |
| KVKK/retention | Envanter ve iş listesi hazır | Roller, aktarım, metin/süreler işletmeye özel onaylı |
| Ücret/URL/deployment | Yapılmadı | Açık kullanıcı onayı ve Free plan teyidi |

Teknik hazırlığın bitmesi restoran pilotunun başlamış olduğu anlamına gelmez. Açık kapılardan biri başarısızsa gerçek müşteri alımı kapalı kalır.
