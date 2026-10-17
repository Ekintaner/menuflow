# MenuFlow — CODEX-006

CODEX-006 doğrulama raporu: [sonuçlar](docs/CODEX-006-results.md), [yerel ölçümler](docs/performance-006.json), [pilot kurulum/kullanım ve kota bütçesi](docs/pilot-operations.md), [yedekleme ve geri yükleme](docs/backup-restore.md). Yerel gerçek tarayıcı entegrasyonu derlenmiş arayüzü kullanır; `npm run build` sonrasında `npm run test:integration` çalıştırın. CI zaten bu sırayı uygular.

Çok işletmeli QR menü: React/Vite arayüzü, Cloudflare Worker API, Supabase Auth/PostgreSQL/Storage.

## Yerel geliştirme

Node.js 24, npm ve veritabanı testleri için Docker gerekir.

```sh
npm ci
npx playwright install chromium
npm run dev
```

`/` CODEX-001 demo sepetidir; `/admin` gerçek yönetici girişidir; `/menu#TOKEN` masaya özel menüdür. Misafir sipariş akışı ve tenant yetkili sipariş paneli çalışır.

```sh
npm run check
npm run test:db
npm run api:check
```

## Gerçek servislerle yerel test

Ayrı `menuflow-local` Supabase projesi 55431/55432 portlarını kullanır. Mevcut başka projelere bağlanmaz. İlk çalıştırma ücretsiz Docker imajlarını indirir.

```sh
npx supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npm run test:integration
npx supabase db advisors --local --type all --level warn --fail-on error
npx supabase migration list --local
npx supabase stop
```

Test rastgele yerel Auth kullanıcıları ve iki işletme açar; kendi oluşturduğu kayıtları temizler. Test yalnız `http://127.0.0.1:55431` adresini kabul eder. `supabase/tests/bootstrap.sql` yalnız ağsız PostgreSQL testinin Auth/Storage karşılığıdır; Supabase'e uygulanmaz. Gerçek servis testi bu taklidi kullanmaz.

Arayüzü bu yerel servisle kullanmak için `.dev.vars.example` dosyasını `.dev.vars` olarak kopyalayın ve `supabase status` ile gösterilen **yerel** API URL, anon/publishable ve service-role değerlerini Worker değişkenlerine girin. Yönetim hesabı, tenant, owner üyeliği ve tenant_settings kontrollü olarak oluşturulur; genel kayıt kapalıdır. Sırlar `VITE_` değişkenlerine, Git'e veya tarayıcı depolamasına konulmaz.

## Kullanım

Yönetici girişinden sonra işletmeyi seçin. Sahip kategori ve ürün oluşturup düzenleyebilir; sıra, arşiv ve müsaitlik ayarlayabilir. Fiyat para biriminde girilir ve kesin tam kuruşa çevrilir. PNG/JPEG/WebP görsel sınırı 300 KB'dır. Masa oluşturun, QR oluştur/yenile düğmesiyle PNG indirin ve menüyü yayımlayın. QR tek sefer gösterilir; yeniden üretmek eski baskıyı iptal eder. Yayımlanmış menüde sonraki değişiklikler hemen görünür.

Çalışanlar menü/masa kayıtlarını salt okunur görür. Sahip, kontrollü açılmış bir hesabın UUID'siyle çalışan ekler ve pasifleştirir. Sahip atama/devretme platform işlemidir. Oturum en fazla bir saat sürer; süresi dolduğunda tekrar giriş yapılır.

## Güvenlik ve yayın

Yönetici istekleri sunucuda `getUser` ile doğrulanır, aktif üyelik her istekte veritabanından okunur; sorgular kullanıcı JWT'si ve tenant RLS ile çalışır. Cookie HttpOnly, SameSite=Strict ve HTTPS'te Secure'dür. Yazma isteklerinde aynı Origin zorunludur. Rate-limit bağları login ve QR okuma isteklerini sınırlar.

256 bit QR token'ının yalnız SHA-256 özeti veritabanındadır. URL fragment'i menü isteğinden önce temizlenir. CODEX-003 menü cookie'si yalnız okuma yeteneğidir; misafir/sipariş oturumu değildir. Sipariş oluşturma, müşteri izolasyonu, atomik fiyat hesaplama ve idempotency CODEX-004 ile tamamlanmıştır.

Görseller özel Storage bucket'ındadır. Yazma/silme/okuma politikaları aktif sahibin tenant'ını denetler; müşteri yalnız doğrulanmış menüdeki görseller için beş dakikalık imzalı URL alır. QR iptali sonraki menü isteğinde etkilidir; önceden indirilmiş içerik geri alınamaz, verilmiş görsel URL'si en fazla beş dakika geçerlidir.

Service-role yalnız Worker'da dar QR/menü/misafir sipariş RPC işlemleri ve menü görsellerini imzalamak için kullanılır. Genel yükseltilmiş yetkili veri ucu yoktur. `private` şeması Supabase Data API'ye açılmamalıdır. `.dev.vars*`, `.env*`, test çıktıları ve yerel servis anahtarları Git'ten dışlanır.

CI lint, derleme, Worker paketleme, birim/API, PostgreSQL, masaüstü/mobil Playwright ve yerel Supabase servis testlerini çalıştırır. Canlı dağıtım yapmaz. Pages `dist/` çıktısı ile aynı origin altında `/api/*` Worker rotası gerekir; SPA fallback API rotasından sonra çalışmalıdır. Canlı servis/ücretli plan oluşturulmadı.

Plan ve aşama raporları `docs/` altındadır.

## CODEX-004: güvenli müşteri siparişi

`/menu#QR_TOKEN` ayrı, dört saatlik HttpOnly misafir oturumu açar. Müşteri sepete ürün ekler, adedi azaltarak çıkarır, not ekler ve görünür işletme/masa/toplamı onaylayarak gönderir. Menü sürümü değişirse güncel fiyatlarla yeniden onay gerekir. Belirsiz ağ sonucunda gönderim anahtarı ve değişmeyen sepet sekme oturumunda saklanır; yenileme sonrası aynı istek güvenle tekrarlanır. Sipariş kimlikleri de aynı sekmede takip için korunur; yetki yalnız sunucudaki cookie'den gelir.

- `POST /api/v1/guest-sessions`: `{token}` → ayrı `mf_guest` cookie.
- `GET /api/v1/menu`: misafir oturumunun menüsü, `version`, `ordering_enabled`.
- `POST /api/v1/orders`: zorunlu `Idempotency-Key`; `{items:[{product_id,quantity}],version,session_id,note?}`. İlk oluşturma 201, aynı içeriğin tekrarı 200; farklı içerik 409.
- `GET /api/v1/orders/{id}`: yalnız ilgili misafir oturumunun siparişi, kalemleri ve müşteriye uygun olaylar. Başka oturum/tenant için 404.

Sipariş RPC'leri yalnız service_role ile çağrılabilir; public/anon/authenticated execute yetkileri kapalıdır. Tenant/masa/fiyat/durum/toplam istekten alınmaz. Menüden gelen `session_id`, cookie oturumuyla eşleşmek zorundadır; başka sekmede masa değişmesi eski sepeti yeni masaya gönderemez. PostgreSQL transaction'ı sipariş, snapshot kalemleri, ilk olay ve idempotency kaydını birlikte yazar. Oturum ve masa kilitleri tekrarları sıralar; ürün/kategori/ayar kilitleri güncel fiyat ve müsaitlik doğrulamasını korur. Tenant başına kabul modu okunur; varsayılan manuel, otomatik modda başlangıç `accepted` olur. Kalem güncellemesi veritabanında engellenir.

Sınırlar: 30 farklı kalem, kalem başına 20 adet, 500 karakter not; oturum başına dakikada 3 yeni sipariş ve masa başına 30 yeni sipariş. Worker IP/oturum başına dakikada 30 gönderim denemesi sınırlar. Tekrar önleme kayıtları en az 24 saat tutulur; bu aşama silme görevi kurmaz. Misafir oturumu dört saatte sona erdiğinden eski anahtar başka oturuma taşınmaz. QR yenileme mevcut oturumu iptal eder; yalnız sipariş alımının kapanması veya masanın pasifleşmesi mevcut sipariş takibini kesmez.

Yerel şema güncellemesi: `npx supabase migration up --local`. Doğrulama: `npm run test:db`, `npm test`, `npm run test:e2e`, `npm run test:integration`, `npm run lint`, `npm run build`, `npm run api:check`, `npm audit`, `npx supabase db advisors --local --type all --level warn --fail-on error`.

Sipariş alımı varsayılan kapalıdır; işletme sahibi CODEX-005 panelinden açabilir. Canlı migration ve deployment ayrı adımlardır.


## CODEX-005: restoran sipariş paneli

`/admin` → **Siparişler**. Sahip ve çalışan, yalnız aktif üyeliği olan işletmenin siparişlerini masa bazında görür; durum, masa ve başlangıç/bitiş tarihine göre filtreler. Tarih alanları tarayıcının yerel saatinden UTC'ye çevrilir; bitiş hariçtir. Aktif/geçmiş listeleri ve ayrıntıdaki olay geçmişi desteklenir. Listeler varsayılan 25, en fazla 100 kayıt; `(created_at,id)` cursor sayfalaması kullanır.

- `GET /api/v1/admin/orders?tenant=UUID&status=active|history|all|STATUS&table=UUID&from=ISO&to=ISO&limit=25&cursor=...`
- `GET /api/v1/admin/orders/{id}?tenant=UUID`
- `POST /api/v1/admin/orders/{id}/transitions?tenant=UUID`: `{version,status,reason?}`. Ret/iptalde gerekçe zorunludur. İzin verilen geçişler CODEX-000 durum makinesiyle aynıdır; terminal sipariş yeniden açılamaz.
- `GET /api/v1/admin/settings?tenant=UUID`; yalnız sahip `PATCH` ile `{version,acceptance_mode:"manual"|"automatic",ordering_enabled:boolean}` gönderir.

Sürüm uyuşmazlığı veya yasak geçiş 409; başka işletmedeki sipariş ayrıntısı 404; aktif üyelik yoksa 403 döner. Sipariş UPDATE kilidi ve canlı üyelik kontrolü, aynı sürüme eşzamanlı iki kararın yalnız birini kabul eder. Durum/sürüm, aktör ve gerekçeli olay, hassas içerik taşımayan denetim kaydı tek transaction'dır. Order tablolarına doğrudan istemci yazması kapalı kalır; özel şemadaki dar yetkili fonksiyon yalnız aktif owner/staff için çalışır. Okumalar kullanıcı JWT'si ve RLS kullanır.

Ayarlar beklenen sürümle güncellenir; sürümü veritabanı trigger'ı artırır ve değişiklikleri denetler. Yeni sipariş ayar satırını kilitleyerek o andaki modu kaydeder. Otomatik kabul `accepted` oluşturur, hazırlığa geçirmez; önceki siparişlere uygulanmaz. QR fiziksel konumu kanıtlamadığı için bu davranış ayar formunda açıklanır.

Görünür sekmede tamamlanan istekten 4 saniye sonra polling yapılır; gizli sekmede ağ isteği gönderilmez ve 30 saniyelik kontrol aralığı kullanılır. Yetki/oturum kaybında liste temizlenir ve polling durur. Ret/iptal, uzun bekleme uyarısı, çakışma sonrası güncel liste, geçmiş ve manuel yenileme desteklenir. Sesli bildirim bu aşamada eklenmedi. Misafirin kendi sipariş takibi aynı order/event kayıtlarından ilerler.
