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
- Giriş bağlantısı süreli ve tek kullanımlıktır. Giriş uçlarında hız sınırı vardır.
- Askıya alma Better Auth admin eklentisinin ban özelliğiyle yapılır: aktif oturumlar anında
  düşer, giriş engellenir. **“Başka kullanıcı gibi giriş yapma” (impersonation) kapalıdır.**
- Test girişi yalnız `APP_ENV` `local`/`test`'te; `prod`'da yapılandırmada yoktur ve bunun testi
  vardır.

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
- Her yetkili eylemin negatif testi vardır (başka bölüm, yetkisiz rol, doğrulanmamış, askıda).

## Yönetici işlem kaydı

Her yönetici eylemi `AdminAuditLog`'a `recordAdminAction` ile, eylemle AYNI veritabanı işleminde yazılır: kim, ne yaptı, hangi kayıtta, gerekçe. Eylem adları ve gerekçe zorunluluğu `rules/adminAudit.ts`'tedir; gerekçe ve metadata
kişisel veri (e-posta, telefon, kimlik numarası, ad alanları) içeremez ve yazılmadan reddedilir. Kapsam:
mezun belgesi onay/ret, rol düzeltme, askıya alma/kaldırma, moderasyon kararları, puan iptali,
şüphe kararı, yönetici atama, dışa aktarma. Kayıt yalnız eklenir; kişisel veri içermez (yalnız
kimlikler). Sistem yöneticisi panelden görür.

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
- **İletişim talebi** onaylanınca ilgili alanlar o kişiye açılır; sahibi istediği an geri alır.
- **Randevu onayında e-posta paylaşılır** (takvim daveti için); talep ekranında önceden yazılır.
- **Hesap silme:** oturumlar düşer, kişisel alanlar anında temizlenir, dosyalar silinir;
  yayınlanmış içerik kullanıcının seçimine göre silinir (varsayılan) ya da anonimleştirilir (K-09,
  `docs/decisions.md`).
- **Veri dökümü:** kullanıcı kendi verisini JSON olarak indirir (KVKK m. 11).
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
  telefon maskeli.

## Güvenlik başlıkları

`next.config` üzerinden: içerik güvenlik politikası (CSP), `X-Frame-Options: DENY` (ya da CSP
`frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (kamera, mikrofon, konum kapalı), canlıda HSTS. Server Actions'ın köken
kontrolü korunur; dosya yükleme gibi rota uçlarında köken ve oturum ayrıca doğrulanır.
