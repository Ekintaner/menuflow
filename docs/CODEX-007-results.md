# CODEX-007 — Restaurant Pilot yerel hazırlık sonuçları

18 Ekim 2026. Başlangıç `f950437` (CODEX-006). Kullanıcı yönlendirmesiyle şimdilik örnek restoran ve ayrıca tek kişiye özel platform yönetimi hazırlandı. Gerçek restoran pilotu başlamadı.

## Git ve önceki CI

Çalışma başında ağaç temizdi. origin adresi https://github.com/Ekintaner/menuflow.git olarak doğrulandı. `git ls-remote` ve fetch sonucu origin/main zaten `f9504378131720868466b717da44227ebda6a69c` üzerindeydi; yeniden push gerekmedi. Bu commit'in [GitHub CI koşusu 39076655030](https://github.com/Ekintaner/menuflow/actions/runs/39076655030) completed/success olarak GitHub REST üzerinden doğrulandı. Bağlayıcının ilk boş workflow cevabı başarı kanıtı sayılmadı. CODEX-007 ayrı yerel commit'tir; bu aşamada push yapılmaz ve yeni GitHub CI henüz çalışmaz.

## Tamamlananlar

- `/platform-demo`: örnek restoran, masa sayısı, restoran/masa ekleme, masa QR PNG indirme ve yazdırılabilir işletme/masa kartı. Veriler yalnız sayfa belleğinde; demo QR gerçek sipariş almaz. Yerel adres `http://127.0.0.1:5198/platform-demo`; dış kullanıcıya açık yayın yok.
- `/platform`: restoran panellerinden ayrı platform yönetimi. Her istekte Supabase getUser ve yalnız sunucu PLATFORM_ADMIN_USER_ID eşitliği; boş ayarda kapalı. Restoran owner/staff ve editable metadata erişim sağlamaz. Aynı Auth login ve 1 saatlik cookie kullanılır; platforma özel MFA akışı bu sürümde yoktur.
- Restoran+settings+owner+1–100 masa tek transaction. İsteğe bağlı önceden açılmış owner UUID; boşsa platform yöneticisi ilk sahip. Masa ekleme 100 toplam sınırı altında tenant kilidiyle yapılır. Restoranlar 50'lik cursor ile listelenir. TRY ve Europe/Istanbul bu ilk sürümün varsayılanlarıdır; yeni restoran menü yayımlanmamış, sipariş kapalı ve manuel kabul ile başlar.
- Yalnız service_role EXECUTE yetkili SECURITY INVOKER platform_provision RPC; tarayıcı rolleri doğrudan çağıramaz. QR ham token'ı yalnız bir yanıt; DB'de SHA-256, sürüm ve audit aktörü. Yenileme eski QR/guest oturumlarını aynı transaction'da iptal eder. Yeni migration yalnız menuflow-local üzerinde uygulandı; gerçek bulut DB'ye bağlanılmadı.
- Pages `/api/*` Function → private Worker service binding; request/response cookie ve Origin korunur. Eksik binding JSON 503; static sayfalar API kotasına sokulmaz. Döngü uyarısı veren wildcard `_redirects` kaldırıldı; Pages default SPA fallback kullanılır.
- Staging/pilot ayrı Worker, rate-limit namespace ve Pages yapılandırma şablonları. Public Worker route, workers.dev ve preview URL kapalı; sipariş alımı global olarak varsayılan kapalı. Eksik cloud bindings/HTTPS/anahtar/boolean ayarı business API'yi kapatır. Health yalnız liveness'tır.
- Pages CLI custom config yolunu kabul etmediği için `prepare-pages.mjs` standart wrangler.jsonc/dist/functions içeren iki ayrı yerel paket üretir. `pilot:check` dry-run/paketleme yapar; upload veya kaynak oluşturmaz. CI'a aynı yerel kontrol eklendi. İç içe geçici Wrangler dosyaları lint kapsamından çıkarıldı.
- [Deployment ve secret checklist](deployment-007.md), [örnek restoran/cihaz/onboarding/KVKK/kabul/rollback defteri](restaurant-pilot-007.md), [kurgusal katalog](demo-catalog.json), [boş gözlem formu](pilot-observations.csv) hazır. CODEX-000, CODEX-006, pilot/kota ve backup rehberleri incelendi; önceki operasyon/backup rehberleri yeni platform kapsamına bağlandı.

## Doğrulama

| Kontrol | Sonuç ve sınır |
|---|---|
| npm run check | Lint, TypeScript/Vite derleme, 91 unit/API ve 36 Playwright testi geçti |
| Platform tarayıcı regresyonu | Masaüstü Chromium + Pixel 7 emülasyonu: restoran/masa oluşturma, PNG download, demo reset, yetkisiz panel; axe sıfır otomatik ihlal, yatay taşma yok |
| npm run test:integration | 2 kapsamlı senaryo geçti; gerçek yerel Supabase Auth/PostgREST/RPC/Storage/PostgreSQL |
| Platform gerçek servis senaryosu | Diğer owner ve staff 403, anon/authenticated doğrudan RPC reddi, geçersiz sahipte rollback, varsayılan kapalı ayarlar, masa limiti/ekleme, QR hash/rotate/guest revocation ve platform actor audit doğrulandı |
| Önceki entegrasyon | Tenant/guest/rol izolasyonu, fiyat/idempotency/transition ve yerel 50 sipariş senaryosu korundu; yeni bulut performans iddiası yok |
| npm run test:db | SQL bütünlük/izolasyon/durum yarışları ve temiz PostgreSQL restore geçti; 4 order/4 item/5 event/4 idempotency, 13 RLS tablo/26 policy ve içerik hash'leri eşleşti |
| npm run api:check / pilot:check | Worker dry-run'ları ve Pages paket derlemesi geçti; deployment yapılmadı |
| Yerel Cloudflare runtime smoke | Pages→Worker service binding: health 200 JSON, credentials olmayan menu 503 NOT_CONFIGURED, bilinmeyen API 404 JSON, /platform-demo 200 HTML. Missing binding 503 de görüldü |
| Pages CLI sınırlaması | Kurulu Wrangler local Pages runtime parent Worker config okuyabildiği için provada service binding açık CLI argümanı ile verildi; production binding/gerçek hesap doğrulaması halen açık |
| Supabase advisors / migrations | Yerel security+performance advisors sorun bulmadı; 5 migration yerel instance geçmişi ile eşleşti; CLI çıktısındaki remote alanı bulut doğrulaması sayılmadı |
| npm audit / Git whitespace | 0 açık; diff --check geçti |
| Görsel inceleme | Yerel örnek panel masaüstü ve mobil görüntüleri incelendi; gerçek cihaz/QR kamera denemesi değildir |
| Secret kontrolü | Eklenen dosyalar ve repo örüntüleri gözden geçirildi; gerçek secret eklenmedi; yerel env/çıktılar Git dışında |

İlk gerçek platform entegrasyonunda service_role için auth.users okuma yetkisi olmadığı görüldü. Gereksiz Auth tablo okuması kaldırıldı; kimlik Worker getUser üzerinden, kayıt varlığı audit FK ile doğrulanır. Son yerel entegrasyon geçti. Gerçek Auth tablosuna yeni SELECT yetkisi verilmedi.

## Açık kalanlar — gerçek pilot için durdurucu kapılar

- Gerçek kullanıcının platform Auth hesabı/UUID'si, Cloudflare ve Supabase hesap yetkisi, Free plan/slot/region teyidi. Şimdilik PLATFORM_ADMIN_USER_ID gerçek hesaba atanmadı.
- Yayın onayı, gerçek staging ve pilot kaynakları/secret/binding/HTTPS smoke. Yeni sürüm push'u ve GitHub CI ayrı onay sonrası.
- Bulut Worker CPU ve quota/egress ölçümü; service binding Free kotasının hesapta teyidi. İlk öneri 4 masa/1 panel/5 aktif müşteri/4 saat; trafik rezervi dahil tahmindir, kapasite kanıtı değildir. Güncel Free sınır ve pause/backup riskleri deployment rehberinde resmi kaynaklarıyla yer alır.
- Fiziksel basılı QR, iPhone/Android/düşük donanım, Wi-Fi/hücresel ağ, VoiceOver/TalkBack, gerçek vardiya ve internet kesintisi provası.
- Gerçek restoran onboarding'i, doğru menü/fiyat/alerjen içeriği, sorumlu personel, destek ve vardiya planı. Kullanıcı şimdilik yalnız örnek istedi.
- SMTP/davet/parola reset teslimatı ve kontrollü hesap kurtarma; UI self-service reset yok. Ücretli servis kurulmadı.
- Tam Supabase Auth+Storage dosyaları+konfigürasyon kurtarma tatbikatı, backup sorumlusu ve ölçülmüş RPO/RTO. Günlük backup otomasyonu kurulmadı; sentetik PostgreSQL restore tam felaket kurtarma değildir.
- KVKK veri sorumlusu/işleyen rolleri, yurt dışına aktarım mekanizması, işletmeye özgü aydınlatma metni, veri talep/incident süreci ve kesin retention kararı. Otomatik temizlik/anonimleştirme yapılmadı; FK/idempotency gözetmeden veri silinmez.
- Platform ekranında restoran silme/devir, isim veya timezone düzenleme, masa azaltma ve tüm siparişleri merkezi izleme yok; ilk sürüm restoran/masa oluşturma ve QR yönetimi sağlar.

Harcama, bulut deployment, dışarıya açık URL, gerçek işletme onboarding'i veya CODEX-007 GitHub push'u yapılmadı. CareerOS'a dokunulmadı. Teknik hazırlık tamamlandı; gerçek restoran pilotu başlamadı.
