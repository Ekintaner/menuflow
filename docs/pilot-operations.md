# MenuFlow pilot kurulum ve kullanım rehberi

18 Ekim 2026. Bu rehber yayın yapmaz. CODEX-007 güncel [deployment/secrets rehberi](deployment-007.md) ve [örnek restoran, platform, cihaz ve kabul defteri](restaurant-pilot-007.md) ile birlikte kullanılır. Şimdilik yalnız örnek restoran hazırlanır; gerçek pilot başlamadı.

## Kurulum

1. Node 24, Docker ve temiz checkout ile `npm ci`, `npx playwright install chromium`, `npm run build` çalıştırın. README'deki özel yerel Supabase stack'ini başlatın; `npm run test:db`, `npm run test:integration`, `npm run check`, `npm run api:check` ve advisors geçmeli.
2. Kontrollü Auth hesabı oluşturun; işletme, tenant_settings ve aktif owner üyeliğini güvenilir platform işlemiyle bağlayın. Genel kayıt açmayın. Çalışanı sahibi UUID ile ekler. Başka tenant üyeliği yetki vermez.
3. Yerel değerleri `.dev.vars.example` üzerinden `.dev.vars` içine girin. Service-role yalnız Worker tarafında kalır. Gerçek anahtarları Git'e, VITE değişkenlerine, ekran görüntüsüne veya destek mesajına koymayın.
4. Sahip kategori/ürün, fiyat ve müsaitlik oluşturur; masa açar, QR indirir, menüyü yayımlar. QR'ı doğru masada deneyin. Sipariş alımını açın; manuel kabul ile başlayın. QR fiziksel konumu kanıtlamaz.
5. Her masa için ayrı telefon oturumunda QR → masa/işletme kontrolü → sepet/toplam → sipariş → panel kabul → hazırlama → hazır → teslim → müşteri durumu akışını uygulayın. Yanlış QR, kapalı ürün, fiyat değişimi ve ağ kesintisini deneyin.
6. Canlı ortam ayrıca onay gerektirir: HTTPS aynı origin `/api/*` Worker rotası, sonra SPA fallback; private şema Data API'ye kapalı; güvenli cookie ve Origin koruması; rate-limit bağları; SMTP/davet/parola sıfırlama; fiziksel QR ve gerçek telefon testi. Yerel hız ölçümü canlı kapasite onayı değildir.

## Vardiya kullanımı

- Çalışan `/admin` → Siparişler ekranını görünür tutar. Onay bekleyenleri kabul/reddeder. Ret/iptalde gerekçe girer. Hazırlama, hazır ve teslim aşamalarını gerçek iş akışında ilerletir. Terminal sipariş değiştirilemez.
- Panelde masa/durum/tarih filtreleri ve geçmiş kullanılır. Aktif görünümde sayfalama varsa sonraki sayfaları da denetleyin; ilk 25 sipariş tüm kuyruk değildir. Sesli alarm yoktur; görünür panel ve sorumlu çalışan gereklidir.
- Sahip alımı kapatabilir; mevcut sipariş takibi sürer. Otomatik kabul yeni siparişleri kabul eder, hazırlamaya geçirmez ve eski siparişleri değiştirmez.
- Misafir oturumu dört saat, yönetici oturumu en fazla bir saattir. Yönetici tekrar giriş yapar. Misafir QR'ı yeniden okutur; eski oturumun siparişlerini yeni oturumdan göremez. Belirsiz gönderim varsa önce çalışanla kontrol edin; yeni QR/oturumla aynı sepeti göndermek yeni sipariş oluşturabilir.

## Kesinti ve destek

Belirsiz gönderimde aynı sekmedeki “Aynı gönderimi tekrar dene” kullanılır; yeni anahtar/sekme/QR açılmaz. Sepet ve anahtar sekme depolamasında korunur. Çalışan sipariş listesi ve masa ile mutabakat yapar. Ağ kesilince onay alınmadan başarı varsayılmaz. Menü fiyatı değişince yeni toplam açıkça tekrar onaylanır.

401/403: tekrar giriş veya üyelik kontrolü. 404: yanlış/iptal QR ya da erişilemeyen sipariş. 409: güncel durum/fiyatı yükleyip yeniden karar. 429: en az 60 saniye bekleme. 503 veya kota kesintisi: alımı durdurup kağıt siparişe geçin; mevcut kayıtları kontrol etmeden yeniden girmeyin. Destek kaydında request_id, saat ve işlem türü yeterlidir; token, cookie ve müşteri notu paylaşmayın.

## Kota ve polling bütçesi

Resmi kaynaklar 18 Ekim 2026'da kontrol edildi: [Workers limitleri](https://developers.cloudflare.com/workers/platform/limits/), [Workers fiyatlandırma](https://developers.cloudflare.com/workers/platform/pricing/), [Supabase fiyatlandırma](https://supabase.com/pricing), [Supabase yedekleri](https://supabase.com/docs/guides/platform/backups).

Workers Free: 100.000 istek/gün (UTC sıfırlanır), 10 ms CPU/çağrı. Ağ bekleme CPU değildir; yerel Node wall-time bu limiti ölçmez. Kota dolunca API hata verebilir. Supabase Free: 500 MB DB, 1 GB dosya, 5 GB egress + 5 GB cached egress, 50.000 MAU; bir hafta hareketsizlikte duraklama, otomatik yedek yok. Ücretsiz katman kesintisiz işletme garantisi değildir.

Görünür panel tamamlanan istekten 4 saniye sonra, müşteri aktif siparişi 10 saniye sonra sorgular. Gizli sekmede istek yok; müşteri terminal siparişleri sorgulamaz. Yavaş istekte sorgular üst üste binmez. İki panel + 50 müşteri, kişi başına tek aktif sipariş ve 12 saat varsayımıyla üst tahmin: `2*43200/4 + 50*43200/10 = 237600` istek/gün; ücretsiz Worker kotası aşılır. Bir panel + 10 sürekli aktif müşteri aynı sürede 54000 sorgudur; menü/giriş/yazma çağrıları buna eklenir. Bir müşteride birden çok aktif sipariş yükü artırır. Gerçekte terminale geçiş/sekme gizlenmesi yükü düşürür; buna güvenerek kota taahhüdü vermeyin.

5 GB/ay egress için ölçülen ortalama cevap baytı × aylık çağrı hesabı yapın; görselleri ve Auth/PostgREST ek trafiğini ayrıca ekleyin. Örneğin 54.000/gün × 2 KB × 30 ≈ 3,24 GB yalnız JSON; bu örnek ölçülmüş cevap boyutu değildir. Haftalık DB/Storage/egress/Worker sayacı ve hata oranını kaydedin; %70'te yeni müşteri alımını sınırlandırın. Gerçek pilotta eşzamanlı aktif müşteri sayısını düşük tutun; sürekli 50 müşteri için ücretsiz katman uygun kabul edilmez.

Misafir/tekrar önleme/olay kayıtları kendiliğinden temizlenmez. Saklama ve güvenli temizleme işi uygulanmadan DB'nin sınırsız büyümeyeceğini varsaymayın. Sipariş kayıtları korunmalı; idempotency kaydı 24 saatten önce silinmemeli. Gerçek hacim ve saklama gereği CODEX-007'de kararlaştırılır.

## Pilot çıkış kapıları

Yerel regresyonlar ve geri yükleme geçmeli. Gerçek bulut CPU/egress/kota, internet gecikmesi ve düşük donanımlı telefon ölçülmeli; yedek sorumlusu ve geri yükleme hedefi atanmalı; SMTP ve gerçek cihazda ekran okuyucu testi tamamlanmalı. Bu doğrulamalar olmadan üretim SLA'sı veya sınırsız pilot onayı verilmez. Harcama, migration ve deployment ayrı yetkiyle yapılır.
