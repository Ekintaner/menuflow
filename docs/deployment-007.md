# CODEX-007 — Güvenli deployment hazırlığı

18 Ekim 2026. Bu dosya yayın yetkisi değildir. Hesap, proje ve işletme bilgileri henüz alınmadı; hiçbir bulut kaynağı oluşturulmadı. CI yalnız doğrular. Gerçek migration, hesap açma, secret yükleme, Pages/Worker deployment ve URL oluşturma için ayrıca açık kullanıcı onayı gerekir.

## Topoloji ve ortam ayrımı

Tarayıcı → aynı origin `/api/*` Pages Function → `MENUFLOW_API` service binding → dış rotası olmayan API Worker → ayrı Supabase projesi. `functions/api/[[path]].ts` isteğin URL/Origin/cookie/body alanlarını değiştirmez; Set-Cookie yanıtı korunur. Eksik/bozuk binding 503 verir; SPA HTML veya uzak adrese fallback yoktur. `_routes.json` yalnız API'yi Functions'a sokar; diğer yollar statiktir. [Pages binding belgesi](https://developers.cloudflare.com/pages/functions/bindings/), [routing](https://developers.cloudflare.com/pages/functions/routing/).

| Ortam | Pages yapılandırması | API yapılandırması | Veri |
|---|---|---|---|
| Yerel | Vite proxy + kök wrangler.jsonc | menuflow-api, loopback 8798 | Yalnız menuflow-local, 55431/55432 |
| Staging (henüz yok) | deploy/pages.staging.json | deploy/worker.staging.json | Ayrı Supabase Free; yalnız sentetik veri |
| Pilot (henüz yok) | deploy/pages.pilot.json | deploy/worker.pilot.json | Ayrı Supabase Free; onaydan sonra tek restoran |

İki Pages projesi ve iki Worker adı ayrı tutulur. Her iki Pages preview binding'i yalnız staging Worker'a yönelir; pilot verisine bağlanmaz. Varsayılan yerel wrangler konfigürasyonunu buluta deploy etmeyin. Worker'larda `workers_dev:false`, `preview_urls:false`, boş routes ve ayrı rate-limit namespace'leri vardır. Sunucu service binding üzerinden çağrılır; Worker için ayrıca herkese açık URL gerekmez. Pages yayını ise URL oluşturur ve ayrıca onay gerektirir. Git otomatik deployment ve preview branch deployment kapalı seçilmeli; Direct Upload tercih edilmeli. Bu ayarlar hesapta doğrulanmadı. Staging anonim internete açılmamalı; Access kapsamı ve ücretsiz hesap uygunluğu doğrulanmadan URL yayımlanmaz. `noindex` erişim kontrolü sayılmaz.

## Environment ve secrets kontrol listesi

| Değer | Yer | Staging/pilot denetimi |
|---|---|---|
| SUPABASE_URL | Worker secret/config | Ortamın doğru project ref'i; HTTPS; staging ve pilot farklı |
| SUPABASE_PUBLISHABLE_KEY | Worker secret | Aynı projeye ait publishable/uyumlu anon key; tarayıcıya gönderilmez |
| SUPABASE_SERVICE_ROLE_KEY | Yalnız Worker secret | Mevcut uygulamanın gerektirdiği service-role key; yüksek yetki; Pages/VITE/Git'e konmaz |
| PLATFORM_ADMIN_USER_ID | Worker secret | Tek, doğrulanmış Auth UUID; boşsa platform API 503 ile kapalı |
| DEPLOYMENT_ENV | Worker vars | staging veya pilot; yazım hatasında uygulama API'si 503 |
| ORDERING_DISABLED | Worker vars | İlk yayın true; false ancak tüm kabul kapıları sonrası |
| AUTH_LIMIT / MENU_LIMIT / ORDER_LIMIT | Worker binding | Üçü de zorunlu; staging ve pilot namespace'leri ayrı |
| MENUFLOW_API | Pages service binding | Doğru Worker; preview daima staging; Pages'te Supabase sırrı yok |
| Cloudflare API token / Supabase erişim token'ı | Operatör secret deposu | Gerekli hesap/projeyle sınırlı; GitHub CI'a bu aşamada yüklenmez |

Gerçek değerleri chat'e yapıştırmayın. Yerelde yalnız gitignored `.dev.vars`; bulutta secret deposu ve Wrangler secret mekanizması. Önce kurulu CLI'nin `secret put --help` yardımını okuyun; doğru `--config deploy/worker.<ortam>.json` hedefini seçin. Parola/anahtarları argüman veya terminal geçmişine yazmayın; etkileşimli secret girdisi kullanın. Dashboard'da yapılan var değişikliklerini sonraki deployment ezebilir: özellikle ORDERING_DISABLED değerini config/release kaydında da takip edin. Secret değişiminde eski sürüme dönüşün eski secret'ı otomatik getirdiğini varsaymayın; sızıntıda anahtarı sağlayıcıda iptal edip yenisini yükleyin.

Sunucu guard'ı bulut ortamında eksik anahtar, HTTP Supabase URL, yanlış environment veya eksik limiter ile iş uçlarını kapatır. Anahtarın gerçekten doğru projeye ait olduğunu çevrimdışı anlayamaz; onaylı staging smoke testi şarttır. `/health` yalnız süreç canlılığıdır; DB/secret/RLS readiness kanıtı değildir.

## Yayın öncesi ve onay sonrası sıra

1. Kullanıcıdan Cloudflare hesap/proje yetkisi, Supabase organizasyonu/region ve platform yöneticisinin Auth UUID'sini güvenli kanaldan alın. Kişisel test hesabını otomatik platform yöneticisi yapmayın. Planların Free olduğunu ve mevcut diğer projelerin kotalarını teyit edin; ücretli add-on seçmeyin.
2. Git commit, migration listesi, secret adları (değerleri değil), hedef proje ref'leri ve rollback sürümlerini release kaydına yazın. `npm run check`, `npm run test:db`, `npm run test:integration`, `npm run pilot:check` geçmeli.
3. Yalnız ayrıca yayın onayı sonrası boş staging Supabase projesini hazırlayın. Auth signup kapalı; redirect/site URL tam HTTPS origin; wildcard yok. Public schema erişimleri migration ile, private Data API'ye kapalı; Storage `menu-images` private ve 300 KB sınırında. Migration dosyaları sırayla uygulanır; `supabase/tests/bootstrap.sql` asla uygulanmaz. Önce CLI help ve doğru hedef ref doğrulanır. Pilot hesabına bağlanarak test/reset çalıştırılmaz.
4. Worker secret'larını staging'e girin; staging Worker'ı yalnız service binding için yayımlayın. Daha sonra Pages staging'e binding bağlayın. `npm run build` ve `npm run pilot:check` ayrı `.wrangler/pages-staging` ve `.wrangler/pages-pilot` paketlerini hazırlar: her biri standart `wrangler.jsonc`, `dist/` ve `functions/` içerir. `deploy/pages.*.json` dosyaları şablondur; Pages CLI özel `--config` yolunu kabul etmez. Onaylı upload ilgili **hazırlanmış paket klasöründen** yapılmalı; `dist` klasörünü dashboard'a tek başına yüklemek API'yi kurmaz. Otomatik deploy komutu script'e eklenmedi. Yapılandırma belgesi: [Pages Wrangler](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
5. Korunan staging'de HTTPS, Origin, Secure/HttpOnly/SameSite cookie, API 404'ün JSON olması, missing binding 503, no-store, QR fragment temizliği, Storage signed URL, iki tenant izolasyonu ve tüm limiter'ları deneyin. CPU/istek, rate-limit ve kota sayaçlarını doğrulayın. Sadece health 200 ile geçmeyin.
6. Aynı sürümü ayrı pilot projeye, ORDERING_DISABLED=true ile alın. Örnek katalog, baskı ve cihaz provasını yapın. Pilot varsayılan sipariş alımı kapalıdır; menü yayımlama ve alımı açma ayrı restoran işlemleridir. Önce global false, sonra yalnız pilot işletmede alım açık olacak şekilde sorumlu operatör kontrol eder. Global durdurma POST /orders'u keser; mevcut takip/yönetim devam eder. Belirsiz gönderimlerin replay'i de durur; masa-panel mutabakatı yapılmadan yeni sipariş alınmaz.
7. İlk pilot yalnız tanımlanan saatlerde ve görünür panel başında sorumlu varken yürür. Yeni sürümde uygulama+API+şema uyumluluğunu doğrulayın; global anahtarı açmayı deployment'ın doğal sonucu saymayın.

Gerçek uygulama komutları yalnız yetkilendirme sonrası güncel CLI yardımından doğrulanır; bu aşamada otomatik deploy script'i veya deploy CI job'u yoktur. `pilot:check` yalnız yerel paketleme/dry-run yapar.

Yerel topoloji provası: ayrı terminalde kökten `npx wrangler dev --local --config deploy/worker.staging.json --ip 127.0.0.1 --port 8799`; hazırlanmış `.wrangler/pages-staging` klasöründe `npx --no-install wrangler pages dev --ip 127.0.0.1 --port 5201 --service MENUFLOW_API=menuflow-api-staging`. Bu kurulu Wrangler sürümünün local Pages runtime'ı parent Worker ayarlarını okuyabildiği için local provada service binding açık CLI argümanıyla da verilir; bunun production binding doğrulaması olduğu iddia edilmez. Secrets girilmemiş provada health 200 JSON, menu 503 NOT_CONFIGURED, bilinmeyen API 404 JSON ve /platform-demo 200 HTML doğrulandı. Root wildcard `_redirects` kuralı döngü uyarısı verdiği için kaldırıldı; Pages'in varsayılan SPA fallback'i kullanılır, API Function önce çalışır. Yerel dev'i bulut yayını sanmayın.

Rate-limit namespace'leri örnek hesap içi kimliklerdir; onaylı gerçek hesapta diğer Worker'larla çakışmadıkları teyit edilmeli. [Rate-limit belgesi](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) sayaçların lokasyona göre ve eventual consistency ile çalıştığını belirtir; bunlar kesin global kota muhasebesi değildir. Yeni siparişlerin veritabanı transaction sınırları ek koruma sağlar. Binding'ler Dashboard'da doğrudan listelenmeyebilir; kontrollü 429 denemesi ve gizlilik gözeten ölçümle teyit edin.

## Ücretsiz planın gerçek sınırları

[Supabase fiyatlandırması](https://supabase.com/pricing) 18 Ekim 2026'da doğrulandı: 2 aktif Free proje sınırı, proje başına 500 MB DB, 1 GB dosya; 50.000 MAU, 5 GB egress + ayrı 5 GB cached egress. Bunları sınırsız trafik veya tek 10 GB havuz saymayın; organizasyonun Usage ekranında kapsam/paylaşımı doğrulayın. Bir haftalık hareketsizlikten sonra pause riski; otomatik backup/PITR yok. Staging+pilot iki slotu tüketebilir; mevcut kullanım varsa yeni proje açmadan kullanıcı kararı gerekir. Supabase branching Free'ye dahil değildir.

Günlük açılışta Dashboard proje durumu ve gerçek menü/sipariş okuması kontrol edilir; paused proje operatör tarafından geri açılır ve prova bitmeden müşteri alınmaz. Ücretsiz projeyi uyanık tutmak için yapay ping görevi kurulmaz. Ağ kesintisinde kâğıt sipariş ve mutabakat gerekir. [Yedek belgesi](https://supabase.com/docs/guides/platform/backups): Free için düzenli dışa aktarma; DB yedeği Storage dosyalarını içermez. Auth, Storage ve konfigürasyon kurtarma ayrıca kanıtlanmalıdır.

[Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp): varsayılan servis üretim teslimat garantisi değildir, alıcı ve gönderim sınırları vardır. Kayıt/davet/reset gerçek e-postayla kanıtlanmadı; UI'da kendi kendine parola kurtarma yok. Pilot personel hesapları kontrollü açılır; reset/davet için operatör destek akışı ve SMTP çözümü doğrulanmadan gerçek restoran alınmaz. Ücretli SMTP eklenmedi.

[Workers limitleri](https://developers.cloudflare.com/workers/platform/limits/) Free için 100.000 istek/gün ve çağrı başına 10 ms CPU. Pages Functions da Workers kotasını paylaşır. Service binding'de ek istek ücreti alınmaması [fiyatlandırmada](https://developers.cloudflare.com/workers/platform/pricing/#service-bindings) açıklanır; Free kota sayaçlarının bu topolojide davranışı hesapta doğrulanmadı. Pilot planında güvenlik payı olarak API çağrı sayısını **iki kat** sayın; gerçek dashboard farkları doğrulanınca bütçeyi düzeltin. CPU'yu iki hop dahil ölçün. Polling hesaplarını bulut ölçümü saymayın.

İlk örnek pilot önerisi: tek restoran, 4 masa, 1 görünür panel, en fazla 5 sürekli aktif müşteri siparişi, 4 saat. Polling üst tahmini `14400/4 + 5*14400/10 = 10800` API çağrısı; iki kat rezerv 21600. Menü, görsel, giriş, yazma, yönetici kontrolü ve aynı hesaptaki diğer Worker trafiği ayrıca eklenir. %70 bütçe sınırında yeni katılımı durdurun; %85 veya servis hatasında global alımı kapatıp manuel sürece geçin. Bu rakam kapasite/SLA onayı değildir. CODEX-006'nın 50 müşteri yük testi yereldir ve sürdürülebilir Free kapasitesi değildir.

[Supabase changelog](https://supabase.com/changelog.md) tarandı. 10 Kasım 2026 eski TLS cipher kaldırımı için Worker→Supabase ve Storage görsellerini eski gerçek cihazda deneyin: [duyuru](https://supabase.com/changelog/cbc-tls-ciphers-deprecated). PostgreSQL minor değişimindeki ltree/btree_gist/legacy pgcrypto kullanımı repoda yok; gerçek proje sürümü/extension listesi ayrıca doğrulanır: [duyuru](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
