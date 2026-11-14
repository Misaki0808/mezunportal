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
- Oturum çerezi yoksa çözümleme/veritabanı sorgusu yapılmaz; çerez varsa yalnız Better Auth kimlik doğrular. Oturum çözümündeki altyapı hatası oturumsuzluk sayılmaz: ortak sınır geçici sorun gösterir, eylem kararlı hata döner; yetki ve veri erişimi kapalı kalır. Günlük tek satırdır, çerez veya hata iletisi içermez. Dosya, takvim ve rapor rotaları oturum altyapısı arızasında veri açmadan 503 ve Retry-After döner; aynı istek içindeki oturum çözümü paylaşılır.
- Giriş ekranı e-postanın kayıtlı olup olmadığını sızdırmaz; her durumda “bağlantı gönderildi”.
- Giriş bağlantısı 10 dakika geçerli, **tek kullanımlıdır** ve veritabanında özetli saklanır. Hız sınırı
  (veritabanı destekli, sabit pencere): bir e-postaya saatte 5 bağlantı, bir istemci adresinden saatte 200
  (adres başlıkla taklit edilebildiği için tamamlayıcıdır; asıl koruma e-posta başınadır), e-posta
  değiştirme kullanıcı başına saatte 3, mezun belgesi yükleme kullanıcı başına saatte 5. Sayaç anahtarları
  HMAC ile özetlenir; ham e-posta/kimlik tabloya yazılmaz. Kampüs NAT arkasındaki bir sınıfın yaklaşık 80 kullanıcısı için doğrulama ve bağlantı eklentisi sınırları 5 dakikada 120, genel sınır dakikada 1000 IP başına istektir; güvenilir istemci IP yapılandırması TD-021 kapsamındadır.
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
  Oturumu düşmüş kullanıcının sunucu eyleminde `AUTH_UNAUTHENTICATED` dönerse ortak hata çıkışı (`failAction`,
  `src/server/fail-action.ts`) aynı kuralla `/giris?donus=<yol>` adresine yönlendirir; eylemler `actionFailure` yerine `failAction` kullanır.
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
| Yayınlanmış deneyim, SSS ve ilan okuma | ✓ (K-07) | ✓ | ✓ | ✓ | ✓ |
| İlan yaz / gönder / çek (yalnız mezun ve akademisyen) | — | ✓ | — | — | — |
| Mentor dizini; randevu, CV inceleme, iletişim talebi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Müsaitlik, randevu onayı, CV incelemesi, SSS cevabı | — | ✓ | — | — | — |
| Deneyim/SSS/ilan moderasyonu, şikâyet kuyruğu | — | — | kendi bölümü | fakülte | hepsi |
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
Kullanıcının kendi adını değiştirmesi de (`USER_NAME_CHANGE`) aynı işlemde yazılır: eylemi yapan ve hedef aynı kullanıcıdır, kayda eski/yeni ad girmez (yalnız
"ad değişti"); ad sunucuda doğrulanır (harf + boşluk/kesme/tire, 2–80 karakter) ve saatte 10 değişiklikle sınırlıdır.

### Kullanım metrikleri (P1-13)

Olay yazımı kişisel veri taşımaz: `props` tür başına `strict` Zod şemasından geçer (enum/sayı/mantıksal; serbest metin yok,
arama olayında süzgeç değeri ve sorgu metni asla), veritabanı CHECK'i ek ağdır. Panel ve Excel yalnız yönetici kapsamındaki
bölümlerin olaylarını gösterir (`departmentId`/`facultyId` süzgeçleri yetki vermez); ayrı kullanıcı sayısı 3'ün altındaki
hücreler gösterilmez; gizli hücre varsa tür toplamı da gizlenir. Anonim deneyim yayın olayı yazarla ilişkilendirilmez. Olay `userId`'si hesap silmede hemen, 24 ay sonra
koparılır. Excel: yetki + saatte 10 sınırı + `DATA_EXPORT` kaydı (hedef `USAGE_METRICS`) tek işlemde; dosyada kişi satırı yok.

### Randevu motoru (P1-10)

Randevu eylemleri yalnız doğrulanmış üyeye açıktır; kimlik oturumdan gelir, yetki işlemin içinde yeniden yüklenir. Talep
yalnız görünür mentora (dizinle aynı görünürlük) ve yalnız sunucunun ürettiği slota yapılır; çakışmanın son sözü
veritabanı exclusion constraint'idir. Randevuyu yalnız iki katılımcı görür (yabancıya `RESOURCE_NOT_FOUND`); `.ics` yalnız
onaylı randevuda ve katılımcı e-postası içermez. Onayda iki tarafın e-postası takvim davetinde paylaşılır (talep ekranı
önceden söyler, `SlotList.emailShared`). Yurt dışı aktarım rızası olmayan taraflı randevuda takvim çağrısı yapılmaz.
Talep hız sınırı 24 saatte 10. Hesap silmede açık randevular sistem tarafından iptal edilir, öğrenci notu/yer notu/link/ret
notu temizlenir; veri dökümü randevuları kapsar (öğrenci notu yalnız yazanın dökümünde).

### Mentor dizini (P1-09)

Dizin ve öneri yalnız doğrulanmış üyeye açıktır; kapsam (K-07) oturumdaki kullanıcıdan sunucuda çözülür. Askıdaki,
silinmiş, doğrulanmamış ya da başka üniversitedeki kullanıcı dizinde yoktur; mentor kendini görmez. Kartta e-posta/telefon
yoktur. Deneyim türü süzgeci anonim deneyimi saymaz. Benzer yol gerekçesi yalnız ortak öğeleri gösterir. Giriş noktası
bayrakları görünmeyen hedef için "mentor değil" der (varlık ayrımı yok).

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

## Faz 2 görünürlük ve rıza kuralları (P2-14 özeti)

Gerekçeler `docs/decisions.md`'dedir (P2-01…P2-13 kayıtları); burada yalnız kalıcı kural ve bekçi yeri durur.

- **K-07 her yerde:** ilan, deneyim, aday, şirket, soru bankası, etkinlik ve özet yalnız arayanın doğrulanmış üyeliklerinin üniversitesindeki
  veriyi görür; kapsam sunucuda oturumdan hesaplanır, istemci süzgeci genişletemez.
- **D7, kaynak bağımsızlığı:** iletişim talebinin hedefi sunucuda çözülür; talep eden, hedefin adını/kimliğini yalnız talep `APPROVED` olunca görür
  (`source` ≠ `PROFILE` için giden listede ve veri dökümünde gizli). Bekleyen talep kaynak ve bağlam başına tektir (profil, aday kartı, ilan
  başına ayrı): bilinen profile giden talep anonim aday/ilan talebiyle `ALREADY_OPEN` ya da ortak `requestId` ile eşlenmez; bir kaynağın
  onayı başka kaynağın bekleyenini kapatmaz. İlan yazarı (`CONTACT_REQUEST`) ve aday (opak `seekerRef`) kullanıcı kimliğiyle anılmaz.
- **Rıza sorgu anında denetlenir:** `JOB_SEEKER_VISIBILITY` geri alınınca kart aynı anda hiçbir yanıtta yoktur (son rıza satırı + güncel sürüm);
  ödül yayını ve hikâye yayını rızaları da geri alınca içeriği kapatır. İsteğe bağlı rıza yokken özellik çalışmaz, hesap kilitlenmez.
- **k-anonimlik ve küçük sayı:** şirket sayfasında çalışan/geçmiş çalışan hücresi 3 kişinin altında gizli; soru grubu en az 3 farklı yazardan;
  başvuru takvimi dağılımı en az 3 farklı yazarlı; ilan erişim ve yayın sayıları 3'ün altında gizli; girişsiz tanıtım sayısı ≥ 3.
  Eşikler satıra değil **farklı yazara** bakar.
- **Kesişim önlemi:** aynı üniversitede anonim deneyim varsa mentor/çalışan/dönem/takvim kesitleri birlikte bastırılır; kesişen kümelerin
  farkından anonim yazar çıkarılamaz. Popüler sıralama anonim deneyimden etkilenmez.
- **Çift rol (aynı kişi hem öğrenci hem mezun/akademisyen):** arama yetkisi yalnız doğrulanmış etkin **mezun** üyelikten gelir (öğrenci üyeliği kapsamı
  genişletmez); kişi kendi aday kartını ve kendisiyle açık talebi olduğu kişiyi aramada görmez; beyan ve kart ayrı kayıtlardır.
- **Kimlik koruması serbest metinde:** başlık satırı, SSS ve soru türevleri ad/e-posta/telefon/kimlik biçimine karşı sorgu anında denetlenir; şüpheli
  satır gösterilmez. Opak aday kimliği rastgeledir, görünürlük kapanınca silinir.
- **Dış servis jetonu:** Google yenileme jetonu veritabanında AES-256-GCM ile şifrelidir (anahtar sunucu sırrından türer); düz metin log, işlem kaydı,
  hata ve yönlendirme adresine girmez; yalnız sistem yöneticisi bağlar/keser.
- **Bekçiler:** sızıntı testleri (`*.db.test.ts`: aday/ilan/deneyim yanıtında ad-e-posta-kimlik yok), `ai-traces`/log bekçileri, rıza kapısı kataloğu
  testi (her sunucu eylemi), migration bekçisi.

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
- **Merkezi zorunlu onay kapısı:** ürün ve yönetim okuma/yazmaları sunucu tarafında kimlik ve rol
  yetkisinden sonra güncel zorunlu onayı denetler; eksik onay `CONSENT_REQUIRED` döndürür. Sunucu
  eylemlerinin otomatik envanter testi yeni eylemin de kapıdan geçmesini veya açık istisnaya alınmasını ister.
  Envanter bütün `src` ağacını AST ile tarar; davranışla sınanan eylem kataloğu dışındaki modül/inline
  eylemi reddeder. Tek inline istisna, prod kapılı kimlik eylemine devreden test giriş formudur.
  Yönetim menüsüne uygunluk yalnız doğrulanmış rol/kapsamı gösterir; eksik rıza rol reddine çevrilmez.
  Veriyi yükleyen eylem yine rıza kapısından geçer ve gerekirse onay ekranına çağrı gösterilir.
  İstisnalar: giriş/çıkış ve kayıt/doğrulama beyanı; onay durumunu görme ve verme; kişinin kendi
  görünürlük ayarları, veri dökümü ve hesap silme/geri çekme işlemleri. Bu istisnalar başkasının
  verisine erişim yetkisi vermez. Sayfa koruması ek yönlendirme sağlar; veri güvenliği sunucu kapısındadır.
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
  döküm nesnesine eklenmez. Bildirim kutusu/tercihleri, mentor ayarları ve müsaitliği ile mezun
  belgesi başvurularının dosyasız metaverisi de yer alır. Bozuk ödül aday ayrıntısı `UNREADABLE`
  işaretiyle döner; sabit bir olay günlüğü değeri veya kimliği içermez.
  Otomatik dökümün bilinen sınırları (erişim talebinin tamamı için ayrıca değerlendirilmelidir):
  - Oturum IP/user-agent ve oturum jetonu: güvenlik oturumu kaydı; otomatik döküme konmaz.
  - Event ve EmailLog: operasyon/ölçüm kayıtları; ileti gövdesi değildir ve dökümde yoktur.
  - JobMatchDigest ve NotificationAction: iş/tek kullanımlık bağlantı durumları; jeton yüzeyini büyütmemek için yoktur.
  - AdminGrant: yetki ve üçüncü kişi referansları içeren yönetim kaydı; otomatik döküme konmaz.
  - Eski UserSkill: taşınmış eski tablo; güncel beceriler profil/CV bölümündedir.
  - İlan/deneyim şikâyet metinleri: üçüncü kişilere ilişkin serbest metin içerebildiğinden otomatik döküme konmaz.
  - User.image: üçüncü taraf görsel adresi olabildiğinden otomatik döküme konmaz.
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
- **Profil serbest metni:** özet/hedef, başlık/şehir, profil kalemleri ve beceriler sunucuda SSS ile aynı
  e-posta/Türkiye cep telefonu/kimlik numarası biçim denetiminden geçer (`src/lib/personal-data.ts`). CV onayından
  gelen yazım da aynı kuralı atlayamaz; kararlardan biri uygunsuzsa işlem bütünüyle reddedilir. Alan hatası kararlı
  `PROFILE_TEXT_PERSONAL_DATA` koduyla gösterilir. Bu bir biçim denetimidir: yıl, sıradan sayılar ve normal URL kabul edilir;
  “at/nokta” gibi yazıyla gizlemeler mevcut SSS kuralının da kapsamı dışındadır. Eski veriler otomatik silinmez/değiştirilmez.
  Hikâye ve deneyim yayını kendi rıza/moderasyon kapılarından geçer; bu kural o yayın sürecini değiştirmez.
- **Başkasının profili:** görünürlük kararı `rules/visibility.ts` tablosundadır ve yanıt sunucuda süzülür: gizli
  e-posta/telefon/sosyal bağlantı/LinkedIn alanının anahtarı bile yanıtta yoktur (rastgele işaretli sızıntı testi).
  Hedef silinmiş/askıda/doğrulanmamışsa ya da bakanla ortak üniversite yoksa `RESOURCE_NOT_FOUND`. Sosyal bağlantılar
  yalnız `https` ve izinli alan adlarıdır (`SOCIAL_LINK_HOSTS`); kimlik bilgisi, özel port, IP adresi ve benzer alan adı
  reddedilir.
- **Çıktı temizliği:** `ParsedCv` bilinmeyen alanları atar (rol/kullanıcı kimliği şemada yok), görünmez ve çift
  yönlü biçim karakterlerini siler, liste ve metin uzunluklarını sınırlar; saklı çıktı uygulamada yeniden
  doğrulanır. Veritabanı kısıtları da metin uzunluğu ve tarih tutarlılığını zorlar.
- **Gerçek modele yalnız maskelenmiş CV metni gider:** yükleyenin adı sunucudan alınır; kişisel veri kalıpları
  yerelde maskelenir ve maskeleyici, çıkarıcı veya metin sağlayıcısı yoksa işlem kapalı kalır. Kural tabanlı
  maskeleme alışılmadık veya gizlenmiş kişisel veriyi her zaman tanıyamayabilir; yurt dışı rızası yüklemede ve
  iş başında denetlenir. Gizlilik önceliklidir: yükleyenin adıyla eşadlı kurum da kısmen maskelenebilir
  (ör. sunucu adı “İpek Işık” iken “Işık Üniversitesi” → “[AD] Üniversitesi”); kurum eki maskeyi atlatma
  istisnası değildir. Üçüncü kişilerin adları yalnız açık referans/yönetici/danışman başlığı ve bu başlığa
  bağlı bloklarda biçimsel olarak aranır; serbest metindeki adlar veya farklı yazılmış başlıklar kaçabilir,
  başlık altındaki kişi dışı büyük harfli ifadeler de gizlenebilir (iş unvanı olarak tek başına yazılan "Yönetici"/"Danışman"
  satırı başlık sayılmaz). Maskelenmeyenler: yaş ("25 yaşında"), anahtar sözcüksüz adres, yalnız ilçe/şehir adı ve tek sözcüklü
  referans adı. Kişisel alan adında en az üç harfli ad
  parçası aranır; bu parça şirket alan adıyla çakışırsa alan adı da gizlenebilir. Yapay zekâ yalnız öneri
  üretir; kullanıcı okul adını onay ekranında düzeltebilir.
- LLM girdisi ve çıktısı loglanmaz.

## Kötüye kullanım sınırları

- Hız sınırı: giriş, CV ayrıştırma (kullanıcı başına günlük), SSS talebi, şikâyet, iletişim
  talebi, randevu talebi.
- İmzalı bağlantılar (ör. “hâlâ orada mısın?”) süreli ve tek kullanımlıktır.
- Puan hilesi kuralları `docs/architecture.md` “Puan motoru”nda.
- SSS: soran, cevap yazan ve moderatör kimliği hiçbir çıktıda yoktur; yayın metni adları ve e-posta/telefon biçimini içeremez
  (sunucuda, yayın anında). Karar notu yalnız soran öğrenciye görünür.
- İlanlar (P2-04): okuyucu çıktısında yazarın adı, kimliği ve iletişim bilgisi yoktur (yalnız rol türü); `CONTACT_REQUEST` ilanında iletişim talebi
  ilan üzerinden gider ve ilan→yazar eşlemesi yalnız sunucudadır (önizleme ad değil ilan başlığı gösterir; ad onayda açılır, D7). Hedef bölümler ve
  kapsam bölümü servis kapısında yazarın üniversitesine bağlanır (K-07; veritabanında tetikleyici yoktur). Başvuru bağlantısı yalnız `https`
  (şema, kimlik bilgisi, iç adres yok). Veri dökümü yalnız kendi ilanlarını içerir; hesap silme ilanları siler.
  (sunucuda, yayın anında; adın tam hali ve kesmeli ekli biçimi engeldir; kesmesiz ekli biçim ve ad önekiyle eşleşen sözcük moderatör onaylı uyarıdır ve işlem
  kaydına düşer). Karar notu yalnız soran öğrenciye görünür.
- Puan çıktısında kaynak (deneyim/randevu/CV) ve karşı taraf kimliği yoktur; katkı puanı ve geçmişi yalnız sahibine görünür. Anonim
  deneyim puan verir ama kurucu üye etiketi vermez. Veri dökümü puanı kaynaksız içerir; hesap silme puan, etiket ve şüphe işaretlerini siler.

## Dış servisler

Anahtarlar yalnız sunucu env'indedir; `NEXT_PUBLIC_*` ile asla. Sağlayıcı yanıtı, iç hata ve
yığın izi kullanıcıya gösterilmez. Ayrıntı `docs/architecture.md` “Dış servisler”.

## Sır ve loglama

- `.env*` repoya girmez; değerler Git dışı `korunan/` klasöründe ve yerel `.env.local`'dadır.
- Loglanmaz: jeton, parola, giriş bağlantısı, CV/belge içeriği, LLM girdi/çıktısı. E-posta ve
  telefon maskeli (`src/lib/mask.ts`: `maskEmail`, `maskPhone`, serbest metin için `maskPersonalData`).
- **Beklenmedik hata günlüğü (`src/server/unexpected-log.ts`):** kodlu olmayan hata (sunucu eylemi, rota, işçi görevi) TEK satır
  yapılandırılmış olay olarak stderr'e yazılır: `{"event":"action|route|job.unexpected","source":"<sabit ad>","errorName":"<sınıf>",
  "errorCode":"<P2034|40001|ECONNRESET>","driverCode":"<57014|57P01|55P03>","errorKind":"<pool_timeout|connection_lost>"}` (`driverCode` yalnız Prisma sürücü hatasında, `meta.driverAdapterError.cause.originalCode|code`'dan ve yalnız sabit listeden; `errorKind` pg'nin kodsuz iki yük hatası için, havuz dolu ve bağlantı koptu). İleti okunur ama yazılmaz, yalnız sabit etiket: ileti yalnız kütüphanenin sabit ifadeleriyle TAM eşleşme ile karşılaştırılır (regex, startsWith, includes yok), kişisel veri taşıyan ileti etiket de almaz. İleti (`err.message`), yığın izi, girdi, e-posta, kullanıcı kimliği
  ve değerler YAZILMAZ; hata sınıfı ve kodu sabit izin listesinden seçilir (yük altı Prisma/pg kodları, uygulamanın kendi hata sınıfları ve sabit kodları; yeni `class X extends Error` bekçi testiyle listeye eklenmeden geçemez). İstemci kontrolündeki istek/eylem kimlikleri yazılmaz. Kodlu hatalar (kullanıcıya dönen `errorCode`), doğrulama
  hataları ve Next.js akış denetimi (yönlendirme, bulunamadı) sessiz kalır; kendi yeniden deneme/kalıcı hata yönetimi olan yol (bildirim niyeti aktarımı) yönetilen hatayı yazmaz, aktarımın kendi işlem hatası tur başına tek satırdır. Sunucu eylemleri `failAction(error, '<eylem adı>')` ile adlandırılır
  (adı zorunlu; bekçi testi her çağrıyı ve adın işlevle eşleşmesini denetler); yeni rota ya da kuyruk görevi aynı yardımcıyı (`logUnexpected`,
  `loggedJob`) çağırır.
- Geliştirme sunucusu da (telefon testi `dev:lan` ile yapılır) bu kurala uyar: Next.js'in sunucu eylemi
  argüman ve istek URL günlükleri kapalıdır; kullanıcı girdisi, kodlanmış jetonlar ve kişisel veri
  URL içinde de bulunabilir (`src/lib/dev-logging.ts`, `next.config.ts` `logging`).

## Güvenlik başlıkları

`next.config` üzerinden: içerik güvenlik politikası (CSP), `X-Frame-Options: DENY` (ya da CSP
`frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (kamera, mikrofon, konum kapalı), canlıda HSTS. Server Actions'ın köken
kontrolü korunur; dosya yükleme gibi rota uçlarında köken ve oturum ayrıca doğrulanır.

- Yılın Mezunu ödülü: kamuya açık doğrulama genel oturum/rıza kapısının gerekçeli istisnasıdır; yalnız ödül sahibinin güncel sürümlü açık yayın rızasıyla sınırlı alanları gösterir. Kod 256 bit rastgele, istek IP bazında hız sınırlı ve sayfa noindex'tir. Açık/kapalı kararları sürümlü ve yalnız eklenen geçmişe yazılır; ödül hesap silmeyle kalktığında kanıt anonimleştirilmiş kullanıcıya bağlı kalır. Kullanıcının veri dökümü kendi ödülü, aday anlık görüntüsü ve rıza kararlarını kapsar.
- Aylık özetten çıkış, kullanıcının isteğe bağlı e-postayı durdurabilmesi için oturum ve zorunlu onay kapısının istisnasıdır. HMAC imzalı bağlantı yalnız ilgili hesabın aylık özet tercihini kapatır; belirteç URL parçasında taşınır, sunucuya POST gövdesiyle iletilir ve sonuç hesap varlığını açıklamaz.

- Ayın mezunu hikâyesi yalnız bölümün doğrulanmış etkin üyelerine açıktır; misafir, başka bölüm ve başka üniversite okuyamaz. Hikâye yalnız moderasyon onayı, güncel sürümlü açık rıza ve o bölümün ilgili ay seçimi birlikte varken görünür. Rıza geri alındığında veya içerik düzenlemeye alındığında ana sayfa ve arşiv hemen kapanır; hesap silinince hikâye ve seçimler silinir, sürümlü rıza kanıtı anonimleştirilmiş hesaba bağlı kalır. Kişisel bilgi biçimleri ve sistemde bilinen diğer kişi adları SSS kimlik kuralıyla taranır; bilinmeyen adların tespiti garanti değildir ve moderasyon gerektirir. Veri dökümü yalnız kullanıcının kendi hikâyelerini ve rıza kararlarını içerir.

- Etkinlik katılımı: kod etkinlik penceresinde iki dakikalık dönemlere bağlıdır; kullanıcı başına dakikada beş deneme ve genel olumsuz yanıt uygulanır. Ağ işareti ham IP yerine etkinliğe bağlı HMAC özetiyle 30 gün tutulur; aktarılmış IP başlığı taklit edilebilir, aynı ağ kullanımı tek başına ihlal kanıtı değildir ve coğrafi doğrulama yapılmaz.
