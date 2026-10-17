# Ortak panel girişi ve yalnız platformdan üyelik verme

18 Ekim 2026. Kullanıcı onayıyla CODEX-007 `3a98d9b` origin/main'e push edildi; [CI 39078029451](https://github.com/Ekintaner/menuflow/actions/runs/39078029451) başarılı. Aynı istekteki yeni karar: platform ve işletmeler aynı giriş yerini kullanır; işletme hesabı/üyeliği verme yetkisi yalnız platform yöneticisindedir.

## Kullanım

- `/login`: tek e-posta/parola girişi. Sunucu hesabı doğrular. PLATFORM_ADMIN_USER_ID ile eşleşen tek kullanıcı `/platform`; aktif işletme üyeliği ve aktif işletmesi bulunan diğer kullanıcılar `/admin` ekranına yönlenir. UI'da rol seçerek yetki alınamaz. Önceden giriş yapılmışsa session endpoint'i aynı kuralı uygular. Üyeliği olmayan veya bütün üyelikleri kapalı hesap giriş yapamaz.
- `/admin` ve `/platform` doğrudan açıldığında da aynı giriş bileşeni kullanılır. Panel içindeki ortak giriş bağlantısı `/login` adresidir. Restoran sahibi/staff platform veri uçlarına erişemez. Misafir QR siparişleri hesap gerektirmez.
- `/platform` → restoran seç → **Hesaplar ve üyelikler**. **Yeni hesap aç** formunda e-posta, en az 12 karakterli ilk parola ve işletme sahibi/çalışan rolü seçilir. Hesap ve üyelik yalnız doğrulanmış platform yöneticisinin sunucu isteğiyle oluşturulur. Parola yanıtta/Git'te/logda saklanmaz, form işlem sonrası temizlenir. E-posta gönderilmez; ilk parola özel güvenli kanaldan işletme yetkilisine iletilir.
- **Mevcut hesaba üyelik ver**: mevcut Auth hesap UUID'si ile seçilen restorana owner/staff üyeliği verilir. Aynı hesap/işletme üyeliği tekrarlandığında çoğaltılmaz. Hesap oluşturan form kayıtlı e-postayı sahiplenmez veya mevcut hesabın parolasını değiştirmez; mevcut üyelik formu kullanılır.
- Üyelik listesinden **Üyeliği kapat/aç**. Kapatma yalnız seçili restoran üyeliğini etkiler, hesabı silmez veya diğer restoran üyeliklerini kapatmaz. Eski JWT ile sonraki restoran isteği ve ortak session kontrolü güncel üyeliğe bakar. Son aktif işletme sahibi kapatılamaz veya çalışan yapılamaz; önce başka owner eklenmelidir. Eşzamanlı kapatmalar tenant kilidiyle sıralanır.
- `/platform-demo`: bütün bunların yalnız bellekteki örneği. Gerçek e-posta/parola kullanmayın. Demo hiçbir Auth hesabı veya e-posta oluşturmaz; yenileyince silinir.

## Sunucu ve veritabanı sınırı

Public signup ucu/UI eklenmedi; yerel Supabase enable_signup=false. Gerçek bulut projede aynı ayarın kapalı olduğu deployment checklist'inde doğrulanmalıdır. SDK Admin createUser yalnız Worker service-role ile çağrılır; [resmi createUser belgesi](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Manuel hesap kurulumu email_confirm=true kullanır; bu kullanıcıya e-posta gönderildiği veya adres sahipliğinin e-postayla doğrulandığı anlamına gelmez. Otomatik davet, ilk girişte zorunlu parola değiştirme, kullanıcı self-service reset ve SMTP bu değişiklikte eklenmedi; gerçek pilot hesap teslim/kurtarma süreci ayrıca tamamlanmalı.

Restoran sahibine eski /admin/staff POST/PATCH/DELETE erişimi 403 PLATFORM_REQUIRED döner. UI'daki çalışan yönetimi bölümü kaldırıldı. `memberships` tablosunda authenticated rolünün INSERT sütun yetkileri, UPDATE(active), DELETE ve eski owner yazma politikaları kaldırıldı. Dolayısıyla tarayıcı Supabase API'sine doğrudan gitse de hesap/üyelik veremez. SELECT ve mevcut tenant izolasyonu korunur. Yeni platform_membership RPC SECURITY INVOKER'dır; yalnız service_role EXECUTE alır; actor sunucuda getUser ile doğrulanan platform kimliğidir. Üyelik ve audit aynı transaction'dadır. Aktif platform yönetici kimliği kullanıcı metadata'sından veya formdaki rol alanından alınmaz.

## Auth hesabı ile üyelik işlemi yarıda kalırsa

Auth hesabı oluşturma ve PostgreSQL üyelik RPC'si ortak transaction paylaşmaz. RPC sonucu doğrulanamazsa API açıkça HTTP 202 + membership_assigned=false + oluşturulan hesap UUID'si döner. UI bunu kısmi sonuç olarak gösterir; sessiz başarı veya otomatik hesap silme yoktur. Liste yenilenir: üyelik zaten oluştuysa tekrar hesap açılmaz; oluşmadıysa aynı UUID ile mevcut hesaba üyelik verilir. Tekrar grant aynı üyeliği upsert eder. Üyelik verilmemiş hesap login/session kontrolünden geçemez. Auth create isteğinin sonucu da belirsizse önce güvenli sağlayıcı Dashboard'unda hesabı kontrol edin; rastgele yeniden hesap/şifre oluşturmayın. Hiçbir gerçek hesap bu hazırlık sırasında açılmadı.

## Migration ve geri dönüş

Yeni migration `20261017231145_central_membership_control.sql` yalnız menuflow-local'a uygulandı. Bulutta deployment/migration için önceki açık yetki kapıları geçerlidir. Yeni frontend/API ile aynı migration sürümü kullanılmalı. Eski sürüme dönüşte membership yazma yetkilerini otomatik geri vermeyin; aksi halde kullanıcının yalnız admin üyelik kuralı bozulur. Forward düzeltme tercih edilir. Auth hesabı/üyelik UUID ve actor audit kayıtları yedek/kurtarma envanterine dahil edilir. Tam Auth+Storage restore ve gerçek cihaz kapıları önceki rehberdeki gibi açıktır.

## Yerel doğrulama

- Lint/TypeScript/Vite build başarılı; 96 unit/API ve 42 masaüstü/mobil Playwright testi geçti. Ortak login'in iki hedefe doğru yönlendirmesi, public signup bağlantısının olmaması, restoran panelinde üyelik verme kontrollerinin yokluğu, demo hesap/üyelik oluşturma ve kapatma; ortak login ve platform demo için axe otomatik erişilebilirlik taraması geçti.
- Üç gerçek yerel Supabase senaryosu geçti. Yeni senaryo platform ve işletme yönlendirmesi, owner'ın account/grant ve doğrudan memberships/RPC yazma yasağı, signup kapalılığı, platformun yeni hesap açması, duplicate e-posta, rol yükseltme reddi, başka tenant izolasyonu, revocation sonrası eski cookie ve yeniden girişin reddi, son owner ve iki eşzamanlı kapatma korumasını doğrular.
- Enjeksiyonla Auth oluşturulduktan sonra üyelik yazması başarısız yapıldı: 202 kısmi sonuç, üyelik öncesi giriş reddi, aynı UUID'ye grant sonrası normal giriş kanıtlandı. Test hesapları yalnız yerel ortamda oluşturulup temizlendi.
- Ağsız PostgreSQL izolasyon/yazma yasağı/durum yarışları ve restore testi geçti: 13 RLS tablo, 23 policy; azalan üç policy eski owner membership yazma politikalarıdır. Restore kaynak/hedef içerik hash'leri ve kayıt sayıları eşleşti.
- Yerel Supabase security/performance advisors sorun bildirmedi. Worker staging/pilot dry-run ve Pages paket derlemesi geçti. CareerOS'a, gerçek işletmeye, bulut hesaplarına veya gerçek secret'lara dokunulmadı.

## CI başlangıç yarışı düzeltmesi

`6659e97` push sonrası [CI 39078544401](https://github.com/Ekintaner/menuflow/actions/runs/39078544401) test:db adımında PostgreSQL socket kaybolmasıyla durdu. Docker giriş betiğinin geçici, yalnız Unix socket dinleyen bootstrap sunucusu ilk pg_isready kontrolünü geçebiliyor; restart sırasında sıradaki SQL bağlantısı kayboluyordu. Readiness kontrolü 127.0.0.1 TCP dinleyen son sunucuyu bekleyecek şekilde düzeltildi. Ek sabit uyku veya başarısız SQL'i görmezden gelme eklenmedi. Yeni yerel test:db ve restore tekrar geçti; test betiği lint kontrolü geçti. Bu düzeltme kullanıcı oturum/üyelik davranışını değiştirmez. Son commit'in GitHub CI sonucu teslim raporunda ayrıca kaydedilir.
