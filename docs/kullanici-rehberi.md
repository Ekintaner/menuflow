# MenuFlow kullanıcı rehberi

Bu rehber müşteri, restoran çalışanı, işletme sahibi ve platform yöneticisi içindir.

## Test ortamı ve giriş

Test adresi: https://menuflow-web-staging.menuflow.workers.dev

Bu ortamda yalnız örnek veri kullanın; gerçek müşteri bilgisi veya gerçek ödeme işlemeyin. Bilgisayardaki yerel ortam ile internet test ortamının hesapları ve verileri ayrıdır.

Yönetim için `/login` sayfasını açın. Size verilen e-posta ve kendinizin belirlediği parola ile giriş yapın. Platform yöneticisi `/platform`, restoran yetkilisi `/admin` ekranını kullanır. Platform yöneticisi işletme üyeliğine de sahipse restoran panelini ayrıca açabilir. Birden fazla işletmeye yetkiniz varsa doğru işletmeyi seçin.

İlk erişimde size özel etkinleştirme bağlantısını açıp parolanızı kendiniz belirleyin. Bağlantı tek kullanımlıdır ve sürelidir. Geçersiz/süresi dolmuş uyarısında yöneticiden yeni bağlantı isteyin. Parolanızı, etkinleştirme bağlantınızı ve sunucu anahtarlarını kimseyle paylaşmayın. Oturum sona erdiğinde tekrar giriş yapın. İşiniz bittiğinde paneldeki çıkış düğmesini kullanın.

## Müşteri: QR ile sipariş

1. Masadaki QR kodunu telefon kamerasıyla tarayın. Hesap açmanız veya giriş yapmanız gerekmez.
2. İşletme ve masa adını kontrol edin. Ürünleri, fiyatları ve varsa görselleri inceleyin.
3. Ürünleri sepete ekleyin, adetleri ve toplamı kontrol edin. Not alanına hassas kişisel bilgi yazmayın.
4. Siparişi gönderin ve durumunu ekrandan takip edin. Bağlantı kesilirse sonucu kontrol etmeden aynı siparişi yeniden oluşturmaktan kaçının.
5. Ödemeyi işletme personeliyle fiziksel olarak tamamlayın. Uygulama kart bilgisi almaz; personel adisyonu ödendi olarak kaydedip kapatır. Test ortamında bu işlem yalnız simülasyondur.

Sipariş kapalıysa personele başvurun. QR uzaktan da paylaşılabileceğinden kodun açılması masada fiziksel olarak bulunduğunuzu kanıtlamaz. Yeni ziyaret için masadaki güncel QR'ı yeniden tarayın; kapanmış ziyaretin eski oturumuyla sipariş ekleyemezsiniz.

## Restoran paneli: günlük kullanım

### Menü ve görseller — işletme sahibi

İlgili işletmeyi seçin. Kategorileri ve ürünleri oluşturun veya düzenleyin. Ürün adı, fiyat, kategori, sıra ve müsaitlik bilgilerini kontrol edin. Fiyatı ekranda istenen para birimiyle girin. PNG, JPEG veya WebP görseller en fazla 300 KB olabilir. Arşivleme ve müsaitlik ayarlarını ürünün durumuna göre kullanın.

Menüyü yayımlamadan önce isimleri, fiyatları, görselleri ve masa QR'ını kontrol edin. Yeni işletme başlangıçta yayımlanmamış ve siparişe kapalıdır. Yayımlanmış menüde sonraki değişiklikler müşteriye hemen yansıyabilir.

### Masalar ve QR kartları

Doğru masanın QR kartını indirin/yazdırın ve yalnız o masaya koyun. QR yenilemek eski baskıyı geçersiz kılar; eski kartları değiştirin. QR bağlantısını herkese açık destek kaydına veya ekran görüntüsüne eklemeyin.

### Siparişler — yetkili çalışan ve sahip

Siparişler bölümünde doğru işletmeyi ve masayı kontrol edin. Manuel kabulde yeni siparişi kabul edin veya gerekçeyle reddedin. Kabul edilen siparişi hazırlanıyor → hazır → teslim edildi adımlarında ilerletin. Otomatik kabul yalnız kabul adımını otomatik yapar; hazırlık ve teslimi personel yönetir.

Görünür sipariş ekranı düzenli yenilenir. Beklenmeyen durumda manuel yenileyin. Başka personel aynı kaydı değiştirdiyse güncel durumu okuyup karar verin; işlemi körlemesine tekrarlamayın. Tamamlanmış sipariş yeniden açılamaz.

### Masa adisyonu ve fiziksel ödeme

Masayı seçip açık adisyonun siparişlerini ve toplamını inceleyin. Ödeme gerçekten tamamlandıktan sonra uygun ödeme/kapatma işlemini uygulayın; test ortamında gerçek para kullanmayın. Sonucun ödendi ve kapatıldı olduğunu doğrulayın. Ağ hatasında önce güncel adisyon durumunu kontrol edin; aynı ödemeyi ikinci kez kaydetmeyin.

### Sipariş ayarları — işletme sahibi

Yoğunluk veya kapanışta sipariş almayı kapatın. Manuel/otomatik kabul ayarını ekibinizle birlikte belirleyin. Sistem genelinde siparişler durdurulmuşsa işletme ayarı tek başına açmaya yetmeyebilir; platform yöneticisine başvurun.

Çalışanlar menü/masa kayıtlarını salt okunur görür. Hesap açma, sahip/çalışan üyeliği verme veya kapatma platform yöneticisinin işidir.

## Platform yöneticisi

`/platform` ekranında işletmeleri, masa sayılarını ve QR kartlarını yönetin. İşletme oluştururken ad/kısa ad ve masa sayısını kontrol edin; varsa doğru sahibin hesabını seçin. Yanlış işletmede işlem yapmamak için her değişiklik öncesinde seçimi doğrulayın.

Hesap ve üyelik yönetiminde doğru kullanıcıya yalnız gereken işletme ve rolü atayın. İşten ayrılan kişinin üyeliğini kapatın. Etkinleştirme bağlantısını yalnız ilgili kişiye güvenli biçimde iletin. İşletme sahibi bu yetkileri kendisi veremez.

Başvuru ve denetim bölümlerinde talepleri ve işlem geçmişini inceleyin. İnternet test ortamında gerçek başvuru toplama kapalıdır; gerçek işletme açılması ve müşteri verisi kullanımı ayrıca onay gerektirir.

## Sık karşılaşılan durumlar

| Durum                                | Yapılacak işlem                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Etkinleştirme bağlantısı geçersiz    | Yönetici yeni bağlantı hazırlasın; eski sekmeyi kullanmayın.                                                          |
| Giriş başarısız                      | Doğru ortam/e-posta/parolayı kontrol edin. Çok denemede yaklaşık bir dakika bekleyin. Parolanızı desteğe göndermeyin. |
| Yetki yok veya işletme görünmüyor    | Platform yöneticisi aktif üyeliği ve rolü kontrol etsin.                                                              |
| QR açılmıyor                         | Güncel masa kartını tarayın, interneti kontrol edin; yenilenmiş QR'ın eski baskısını değiştirin.                      |
| Sipariş alınamıyor                   | İşletme ve genel sipariş ayarlarını personele kontrol ettirin.                                                        |
| Görsel yüklenmiyor                   | Dosya türü/boyutunu kontrol edin ve menüyü yeniden açın.                                                              |
| İşlem çakışması veya bağlantı hatası | Listeyi yenileyip mevcut sonucu kontrol edin; ödeme/siparişi tekrar oluşturmadan önce doğrulayın.                     |

Destek isterken saat, cihaz/tarayıcı, ekran adı ve kişisel veri içermeyen hata mesajını iletin. Parola, anahtar, etkinleştirme bağlantısı, QR içeriği veya müşteri bilgisi göndermeyin.

## Test kabulü

Telefon testi kullanıcı tarafından başarılı olarak bildirildi; ayrıntılı cihaz/ağ kapsamı kaydedilmedi. Yeni sürümlerde Wi-Fi ve mobil internetten QR → menü → sipariş → restoran paneli → adisyon → deneme ödemesi/kapatma akışını tekrar kontrol edin. Gerçek işletme kullanımına geçiş için [pilot işletim rehberindeki](pilot-operations.md) yayın, yedekleme, veri koruma ve maliyet adımlarını tamamlayın.
