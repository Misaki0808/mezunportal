# Güvenlik ve KVKK modeli

Son güncelleme: **2026-11-07** (kod öncesi). Hukuki metin taslakları `docs/legal-drafts.md`'tadır.

## Güvenlik hedefleri

- Yalnız doğrulanmış üyeler içeri girer; doğrulanmamış kullanıcı yalnız kendi profilini görür.
- Kullanıcı başkasının gizli alanını, yönetici kapsamı dışındaki veriyi göremez.
- Kişisel veri en az düzeyde, en kısa sürede tutulur; amaç bitince silinir.
- Yapay zekâ çıktısı ve kullanıcı girdisi güvenilmezdir; yetki belirlemez.
- Yönetici eylemleri iz bırakır.

## Güven sınırları

Tarayıcı güvenilmez. Kimlik ve rol oturumdan gelir; istemcinin gönderdiği rol, kullanıcı kimliği
veya bölüm kimliği yetki kararında kullanılmaz. Ekranda gizlemek yetkilendirme değildir; aynı
kural sunucuda zorlanır.

## Kimlik ve oturum

- Better Auth: e-posta bağlantısıyla giriş (parolasız) ve LinkedIn ile giriş. Veritabanı oturumu;
  çerez `httpOnly`, `secure`, `sameSite=lax`.
- Giriş ekranı e-postanın kayıtlı olup olmadığını sızdırmaz; her durumda “bağlantı gönderildi”.
- Giriş bağlantısı 10 dakika geçerli, **tek kullanımlıdır** ve veritabanında özetli saklanır. Hız sınırı
  (veritabanı destekli, sabit pencere): bir e-postaya saatte 5 bağlantı, bir istemci adresinden saatte 20
  (adres başlıkla taklit edilebildiği için tamamlayıcıdır; asıl koruma e-posta başınadır), e-posta
  değiştirme kullanıcı başına saatte 3, mezun belgesi yükleme kullanıcı başına saatte 5. Sayaç anahtarları
  HMAC ile özetlenir; ham e-posta/kimlik tabloya yazılmaz.
- **HTTP yüzeyi beyaz listedir** (`rules/authRoutePolicy.ts`): `/api/auth/` altında yalnız bağlantıya
  tıklamayla tetiklenen GET uçları (`magic-link/verify`, `verify-email`, `callback/linkedin`) açıktır;
  Better Auth'un admin (impersonation dahil), kayıt, parola, oturum ve doğrudan giriş uçlarının hepsi 404
  verir. Giriş, e-posta değiştirme ve çıkış sunucu eylemlerinden geçer (kendi hız sınırımız ve nötr
  yanıtımızla). Bağlantı hataları kullanıcıya `/giris?hata=<ErrorCode>` olarak gösterilir.
- Oturum 14 gün, çerez önbelleği yok (askı/silme anında etkili). Oturum kaydında IP ve user-agent
  SAKLANMAZ. Çerez: `httpOnly`, `sameSite=lax`; `secure` canlıda (yerelde http çalışmak zorunda).
- Askıya alma Better Auth admin eklentisinin ban alanlarıyla yapılır: askıdaki kullanıcı bağlantıya
  tıklasa da oturum AÇAMAZ (`BANNED_USER` → `/giris?hata=AUTH_ACCOUNT_SUSPENDED`); açık oturumları yetki
  katmanı zaten reddeder. **“Başka kullanıcı gibi giriş yapma” (impersonation) kapalıdır:** eklentinin rol
  sistemi devre dışıdır (hiçbir rol yönetici sayılmaz, tek tanımlı rolün izni yoktur); `User.role` bir yetki
  kaynağı değildir ve `role = 'admin'` olsa bile `impersonate-user`, `set-role`, `remove-user` reddedilir.
- **LinkedIn** (anahtar yoksa kapalı): yalnız ad, e-posta ve fotoğraf; erişim/yenileme/kimlik jetonları
  SAKLANMAZ (sağlayıcıya girişten sonra bir daha gidilmez). Hesap bağlama yalnız sağlayıcı e-postayı
  doğrulanmış bildirirse ve e-posta eşleşirse olur; güvenilir-sağlayıcı listesi boştur (hesap devralma yok).
- **E-posta değiştirme** iki adımlıdır: eski adrese onay bağlantısı, onaydan sonra yeni adrese doğrulama
  bağlantısı. Yeni adres başkasına aitse yanıt aynıdır ve e-posta gitmez (kayıt durumu sızmaz); kullanıcının
  kendi mevcut adresi `EMAIL_CHANGE_SAME_ADDRESS` ile reddedilir. İki bağlantı sabit site içi yollara döner
  (`/hesap/e-posta?adim=eski-onaylandi` / `tamamlandi`; değer beyaz listeden okunur).
- **Oturum ve dönüş yolu:** oturum isteyen sayfa (`PrivacyGuard`) oturumsuz kullanıcıyı (çıkış yapmış, silinmiş
  hesap dahil) girişe, zorunlu onayı eksik kullanıcıyı onaya yönlendirir; gidilmek istenen yol `?donus=` ile
  taşınır ve magic-link geri çağrısına konur. **Açık yönlendirme yoktur:** yalnız `/` ile başlayan site içi
  yol (`//`, ters eğik çizgi, şema, kontrol karakteri yok; giriş/onay/çıkış/API yollarına dönülmez —
  `src/lib/return-path.ts`). Yol, `proxy.ts`'in sunucuda yazdığı başlıktan okunur (istemcinin gönderdiği ezilir).
- **Alan adı doğrulaması** (D2) seçilen bölümün ÜNİVERSİTESİNİN `University` kaydındaki alan adı listesine
  göredir, tam eşleşmedir (alt alan adı/benzer alan adı eşleşmez); e-posta doğrulanmış olmalıdır; mezun alan
  adıyla doğrulanamaz.
- **Mezun belgesi:** yalnız PDF ≤ 5 MB; sunucu boyutu yeniden doğrular ve dosyanın İÇERİĞİNE bakar (`%PDF-`
  sihirli baytı; MIME/uzantı güvenilmez). Dosya `graduation/<userId>/<uuid>.pdf` anahtarıyla Git dışı
  depoda durur ve yalnız belgenin bölümünü kapsayan doğrulanmış yöneticiye yetki kontrollü rotadan akıtılır
  (`nosniff`, `no-store`, `default-src 'none'; sandbox`); başvuran kendi belgesini bu rotadan okuyamaz.
  Karar işlemi tek veritabanı işleminde yetkiyi yeniden doğrular, üyeliği günceller, işlem kaydını yazar ve
  dosyayı SİLER (silme başarısızsa karar geri alınır); karar sonrası belge depoda yoktur.
- Test girişi yalnız `APP_ENV` `local`/`test`'te; `prod`'da yapılandırmada yoktur (eklenti yüklenmez, uç
  hiç bulunmaz) ve bunun testi vardır.

## Yetkilendirme

Roller: `STUDENT`, `ALUMNI`, `ACADEMIC` (üyelik). Mentorluk etkin `MentorProfile` demektir: mezun
ve akademisyen açabilir; öğrenci eşiği K-08. Yönetici yetkisi ayrı tablodur (`AdminGrant`):
`SYSTEM`, `FACULTY(id)`, `DEPARTMENT(id)`; kapsam aşağıyı kapsar.

| Eylem | Öğrenci | Mentor | Bölüm yön. | Fakülte yön. | Sistem yön. |
|---|---|---|---|---|---|
| Kendi profili, CV, görünürlük | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deneyim yaz / taslak / moderasyona gönder | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yayınlanmış deneyim ve SSS okuma | ✓ (K-07) | ✓ | ✓ | ✓ | ✓ |
| Mentor dizini; randevu, CV inceleme, iletişim talebi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Müsaitlik, randevu onayı, CV incelemesi, SSS cevabı | — | ✓ | — | — | — |
| Deneyim/SSS moderasyonu, şikâyet kuyruğu | — | — | kendi bölümü | fakülte | hepsi |
| Mezun belgesi onayı, rol düzeltme, askıya alma | — | — | kendi bölümü | fakülte | hepsi |
| Rapor, Excel dışa aktarma, metrik paneli | — | — | kendi bölümü | fakülte | hepsi |
| Puan kuralları, sözlükler, yönetici atama, şüphe kararı | — | — | — | — | ✓ |

- Doğrulanmamış kullanıcı yalnız kendi profilini görür. **Askıdaki kullanıcının oturumu yoktur**
  (ban oturumları düşürür); yetki katmanı da ona hiçbir şey açmaz (`AUTH_ACCOUNT_SUSPENDED`), kendi
  profilini bile. Silinmiş hesap “oturumsuz” sayılır (`AUTH_UNAUTHENTICATED`; varlığı sızdırılmaz).
- **Yönetici yetkisi üyelik yerine geçmez:** yönetici işlemi için kapsamı kapsayan etkin yetkiye ek olarak
  doğrulanmış, etkin bir üyelik de gerekir. Kapsam aşağıyı kapsar (sistem ⊃ fakülte ⊃ bölüm), yukarıyı ve
  yanı kapsamaz; kaldırılmış yetki ve bozuk (hedefi eksik) yetki hiçbir şeyi kapsamaz.
- Karar `src/server/rules/authorization.ts`'tedir (saf işlev, matris tablo-güdümlü test); korumalar
  `src/server/permissions`'tadır (`requireUser`, `requireVerifiedMember`, `requireMentor`, `requireAdmin`,
  `requireModerator`, `canModerate`). Kimlik oturumdan gelir; oturum bağlantısı P1-02'ye kadar kapalıdır
  (fail-closed).
- Moderasyon kapsamı içeriğin yazıldığı andaki bölümüne göre belirlenir.
- **K-07:** yayınlanmış içerik, içeriğin yazıldığı bölümün üniversitesindeki bütün etkin ve
  doğrulanmış üyelere açıktır; bölüm/fakülte sınırı yoktur. Başka üniversiteye açılmaz. Bu kaynak
  kapsamı servis sorgusunda doğrulanır; genel `requireVerifiedMember` tek başına yeterli değildir.
- **Anonim deneyim:** yazar kimliği kendi listesi ve moderasyon dahil hiçbir çıktı şemasında yoktur;
  sunucudaki sahiplik bağı istemciye verilmez. Şikâyet çıktısı da raportör kimliği taşımaz.
  Servis yanıtı tek kapalı dönüştürücüden geçer; moderasyon audit metadata'sına yazar kimliği yazılmaz.
- Deneyimde yayın/ret ve şikâyet çözümü kapsamı işlem içinde yeniden denetler; karar ile audit aynı
  transaction'dadır. Yayınlanmış içerik yazarınca değiştirilemez; reddedilen içerik yeniden taslağa
  alınarak gönderilir. Şikâyet sınırı sözleşmedeki kullanıcı başına 10/24 saattir (DB sayacı).
- Her yetkili eylemin negatif testi vardır (başka bölüm, yetkisiz rol, doğrulanmamış, askıda).

## Yönetici işlem kaydı

Her yönetici eylemi `AdminAuditLog`'a `recordAdminAction` ile, eylemle AYNI veritabanı işleminde yazılır: kim, ne yaptı, hangi kayıtta, gerekçe. Eylem adları ve gerekçe zorunluluğu `rules/adminAudit.ts`'tedir; gerekçe ve metadata
kişisel veri (e-posta, telefon, kimlik numarası, ad alanları) içeremez ve yazılmadan reddedilir. Kapsam:
mezun belgesi onay/ret, rol düzeltme, askıya alma/kaldırma, moderasyon kararları, puan iptali,
şüphe kararı, yönetici atama/kaldırma, sözlük değişikliği, eşleşmeyen değer çözümü, dışa aktarma.
Kayıt yalnız eklenir; kişisel veri içermez (yalnız kimlikler). Sistem yöneticisi panelden görür.

### Yönetim paneli kuralları (P1-11)

Sözleşme `src/contracts/admin.ts` ve `admin-users.ts`'tedir; hangi eylemin kime açık olduğu `ADMIN_ACTION_ACCESS`
tablosundadır. Panele giriş `requireAnyAdmin` (kapsamı olan etkin yetki + doğrulanmış üyelik); sistem yöneticisine
özel eylemler (sözlük, eşleşmeyen değer, yönetici atama, işlem kaydı görüntüleme) `requireAdmin({ kind: 'SYSTEM' })`.
- **Kapsam dışı görme yok:** her liste yöneticinin kapsamıyla kesişir; `departmentId`/`facultyId` süzgeçleri yetki
  vermez. Telefon ve e-posta çıktı şemalarında yalnız maskelidir (`maskedEmail`, `maskedPhone`); şikâyet
  çıktısında raportör, yazar ve moderatör kimliği yoktur.
- **Askıya alma hesap geneli olduğundan** hedefin BÜTÜN üyelikleri yöneticinin kapsamında olmalıdır; üyeliği olmayan ya da
  kısmen kapsanan kullanıcıyı yalnız sistem yöneticisi yönetir. Kendi hesabın/yetkin üzerinde işlem yapılamaz;
  etkin yönetici yetkisi olan kullanıcıyı yalnız sistem yöneticisi askıya alır/düzeltir (bölüm yöneticisi üstündekini
  askıya alamaz). Yetki işlemin İÇİNDE yeniden doğrulanır; değişiklik ve işlem kaydı aynı işlemdedir.
- **Açık onay:** askıya alma/kaldırma, üyelik düzeltme, yönetici atama/kaldırma ve sözlük silme
  girdileri `confirmed:true` ister. Askı kaldırma da gerekçelidir; sözlük silme ve eşleşmeyeni atmada
  gerekçe zorunludur. Maske yalnız alan adı değildir: çıktı şeması ham telefon/e-posta değerini reddeder.
- **Askı:** ban alanları yazılır ve oturumlar aynı işlemde silinir; kullanıcı yeni oturum açamaz. Süreli askı en fazla
  365 gün. Son sistem yöneticisi yetkisi kaldırılamaz.
- **Okuma servisleri** (`services/admin-panel.ts`) yetkiyi işlemin içinde yeniden yükler ve sonucu sözleşme şemasından
  geçirir (şemalar `strict`: ham alan çıktıya giremez). Kapsam dışı bölüm süzgeci boş sonuç verir. Bölüm yöneticisinde var
  olmayan ile kapsam dışı kullanıcı ayırt edilmez (`AUTH_FORBIDDEN`). Kullanıcı araması ad/e-postada çalışır ama çıktı
  maskelidir; arama yalnız yöneticinin kendi kapsamındaki kullanıcıları tarar (kapsam dışı e-posta varlığı sızmaz) ve
  `LIKE` özel karakterleri kaçırılır. İşlem kaydı görüntülemede kişisel veri gibi görünen metin okuma anında da gizlenir
  (`[gizlendi]`); yazım yolu zaten reddeder, bu son ağdır.
- **Excel dışa aktarma** yetki kontrollü rotadır (`/api/yonetim/rapor/istihdam`, oturum + kapsamı olan doğrulanmış
  yönetici): saatte 10 sınırı, `DATA_EXPORT` kaydı ve dosya üretimi tek işlemdedir; hata hiçbir şey teslim etmez.
  Hücreler düz metindir (formül değil). Bilinen sınır: gösterilen kovalar toplamı ile `alumniWithPosition` farkı,
  bastırılan grupların toplamını verir; kişi ya da grup kimliği bu farktan çıkmaz (pilot ölçeği).
- **Toplu rapor ve Excel kişi satırı içermez:** mezun istihdam dağılımları sözlükle eşleşen adlarla ve küçük hücre
  bastırmayla (`REPORT_MIN_GROUP_SIZE` = 3) verilir; her dışa aktarma `DATA_EXPORT` kaydı yazar ve hız sınırlıdır.

## KVKK

- **Veri sorumlusu** K-03 ile netleşir; aydınlatma metni buna göre yazılır, son halini
  hoca/üniversite onaylar.
- **Rızalar sürümlüdür ve yalnız eklenir.** Kayıtta aydınlatma metni ve kullanım şartları
  onaylanır. **Yurt dışına aktarım açık rızası** ayrı ve isteğe bağlıdır: CV'nin LLM sağlayıcısına
  gönderilmesi ve Google Takvim davetinde e-posta işlenmesi buna bağlıdır. Rıza yoksa CV
  ayrıştırma kapalıdır (elle giriş açık) ve online randevuda mentor kendi linkini girer. Metin
  sürümü değişince kullanıcı yeniden onaya yönlenir.
- **Görünürlük seviyeleri:** `PRIVATE` (yalnız sahibi; yönetici yalnız görev ekranında, maskeli) ·
  `ON_APPROVED_REQUEST` (onaylı iletişim talebi sahibine) · `MEMBERS` (doğrulanmış üyelere).
  Varsayılan: e-posta ve telefon `ON_APPROVED_REQUEST`; sosyal linkler ve LinkedIn `MEMBERS`.
- **İletişim talebi** onaylanınca ilgili alanlar o kişiye açılır; sahibi istediği an geri alır. Talep formu
  önizlemesi (`previewContactTarget`) kullanıcı varlığını sızdırmaz: hedef yok, silinmiş, askıda, kendisi ya
  da talep alabileceği alanı yoksa yanıt aynıdır; saatte 60 ile sınırlıdır.
- **Rıza kapısı yönetimde de geçerlidir:** zorunlu onayı güncel olmayan yönetici belge kuyruğunu, belge
  dosyasını ve kararı kullanamaz (`CONSENT_REQUIRED`; yetki kontrolünden sonra, yetkisize rıza durumu söylenmez).
- **Randevu onayında e-posta paylaşılır** (takvim daveti için); talep ekranında önceden yazılır.
- **Hesap silme:** oturumlar düşer, kişisel alanlar anında temizlenir, dosyalar silinir;
  yayınlanmış içerik kullanıcının seçimine göre silinir (varsayılan) ya da anonimleştirilir (K-09,
  `docs/decisions.md`). Kişisel profil ve etiket ilişkileri her iki seçimde de silinir; ortak etiket
  sözlüğü korunur. Profil yazımı aynı kullanıcı kilidi altında hesap durumunu yeniden doğrular.
  Deneyim taslak/bekleyen/ret kayıtları her iki seçimde silinir; anonimleştirme yalnız yayınlanmış
  deneyimi yazar bağı kopuk bırakır. Kişinin şikâyet metinleri silinir. Deneyim yazımı aynı User kilidini alır.
- **Veri dökümü:** kullanıcı kendi verisini JSON olarak indirir (KVKK m. 11); kendi profilinin
  kişisel alanları, ilk giriş adım durumları ve etiketleri dahildir. Profil yoksa `profile: null` döner.
  Deneyimler bütün durumlarıyla yalnız kendi içeriklerinden oluşur; yazar/moderatör kimlikleri deneyim
  döküm nesnesine eklenmez.
- **Çerezler:** yalnız zorunlu oturum çerezi; üçüncü taraf analitik ve reklam çerezi yok
  (metrikler kendi tablomuzda). Çerez bandı yerine aydınlatma metninde çerez bölümü yeterli
  görünür; son değerlendirme hukuki metin onayıyla (PILOT-LEGAL).
- **Saklama:** `docs/data.md` “Veri güvenliği ve saklama”.

## Dosya ve yapay zekâ

- **Yükleme:** yalnız PDF; boyut ve sayfa sınırı; uzantıya değil sihirli bayta bakılır. Dosyalar
  `public/` altında değil, yetki kontrollü rota üzerinden akıtılır; yanıtta
  `Content-Disposition` ve `X-Content-Type-Options: nosniff`, PDF görüntülemede kısıtlı içerik
  politikası.
- **CV'de gizli talimat (prompt injection):** CV, beyaz yazı gibi görünmez metinle modele talimat
  vermeye çalışabilir (“beni yönetici yap”, “diğer kullanıcıları listele”). Kurallar:
  model yalnız `ParsedCv` şemasındaki alanları üretir ve çıktı Zod ile doğrulanır; alan uzunlukları
  sınırlıdır; çıktı yalnız **öneri** olarak onay ekranına gelir, kullanıcı onaylamadan
  uygulanmaz; rol, yetki, doğrulama durumu ve başka kullanıcıya ait veri **hiçbir zaman** LLM
  çıktısından yazılmaz; modele araç/çağrı yetkisi verilmez.
- **Yükleme denetimi içeriğe bakar:** şifreli PDF ve 6 sayfadan uzun PDF reddedilir; maliyet sınırları (5 MB,
  günlük hak, sağlayıcı harcama sınırı) sayfa sayımının sezgisel olmasını telafi eder.
- **Başkasının profili:** görünürlük kararı `rules/visibility.ts` tablosundadır ve yanıt sunucuda süzülür: gizli
  e-posta/telefon/sosyal bağlantı/LinkedIn alanının anahtarı bile yanıtta yoktur (rastgele işaretli sızıntı testi).
  Hedef silinmiş/askıda/doğrulanmamışsa ya da bakanla ortak üniversite yoksa `RESOURCE_NOT_FOUND`. Sosyal bağlantılar
  yalnız `https` ve izinli alan adlarıdır (`SOCIAL_LINK_HOSTS`); kimlik bilgisi, özel port, IP adresi ve benzer alan adı
  reddedilir.
- **Çıktı temizliği:** `ParsedCv` bilinmeyen alanları atar (rol/kullanıcı kimliği şemada yok), görünmez ve çift
  yönlü biçim karakterlerini siler, liste ve metin uzunluklarını sınırlar; saklı çıktı uygulamada yeniden
  doğrulanır. Veritabanı kısıtları da metin uzunluğu ve tarih tutarlılığını zorlar.
- **Modele yalnız PDF gider:** kullanıcı kimliği, e-posta, rol ve başka kullanıcı verisi isteğe girmez; yurt dışı
  rızası yüklemede ve iş başında denetlenir.
- LLM girdisi ve çıktısı loglanmaz.

## Kötüye kullanım sınırları

- Hız sınırı: giriş, CV ayrıştırma (kullanıcı başına günlük), SSS talebi, şikâyet, iletişim
  talebi, randevu talebi.
- İmzalı bağlantılar (ör. “hâlâ orada mısın?”) süreli ve tek kullanımlıktır.
- Puan hilesi kuralları `docs/architecture.md` “Puan motoru”nda.

## Dış servisler

Anahtarlar yalnız sunucu env'indedir; `NEXT_PUBLIC_*` ile asla. Sağlayıcı yanıtı, iç hata ve
yığın izi kullanıcıya gösterilmez. Ayrıntı `docs/architecture.md` “Dış servisler”.

## Sır ve loglama

- `.env*` repoya girmez; değerler Git dışı `korunan/` klasöründe ve yerel `.env.local`'dadır.
- Loglanmaz: jeton, parola, giriş bağlantısı, CV/belge içeriği, LLM girdi/çıktısı. E-posta ve
  telefon maskeli (`src/lib/mask.ts`: `maskEmail`, `maskPhone`, serbest metin için `maskPersonalData`).
- Geliştirme sunucusu da (telefon testi `dev:lan` ile yapılır) bu kurala uyar: Next.js'in sunucu eylemi
  argüman ve istek URL günlükleri kapalıdır; kullanıcı girdisi, kodlanmış jetonlar ve kişisel veri
  URL içinde de bulunabilir (`src/lib/dev-logging.ts`, `next.config.ts` `logging`).

## Güvenlik başlıkları

`next.config` üzerinden: içerik güvenlik politikası (CSP), `X-Frame-Options: DENY` (ya da CSP
`frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (kamera, mikrofon, konum kapalı), canlıda HSTS. Server Actions'ın köken
kontrolü korunur; dosya yükleme gibi rota uçlarında köken ve oturum ayrıca doğrulanır.
