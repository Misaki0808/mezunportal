# Veri mimarisi ve değişmezler

Son güncelleme: **2026-11-07** (kod öncesi taslak).

Şema yazıldıktan sonra model, alan, enum, indeks ve ilişki için tek doğruluk kaynağı
`prisma/schema.prisma`; değişim geçmişi `prisma/migrations/`'tır. Aşağıdaki “Model grupları”
bölümü yalnız henüz yazılmamış modellerin taslağıdır; her model şemaya girince buradan kaldırılır ve
belgede yalnız sahiplik, değişmezler ve politikalar kalır.

## Veri sahipliği

- Kişisel veri kullanıcıya aittir; görünürlüğünü kullanıcı belirler (`docs/security.md`).
- Yayınlanmış deneyim ve SSS platformun içeriğidir; yazarın kimliği anonim içerikte hiçbir
  yanıtta yer almaz.
- Kurum yapısı (üniversite → fakülte → bölüm) ve sözlükler (şirket, sektör, unvan) sistem
  yöneticisinindir.
- Ayrıştırma çıktısı, belge ve eski CV geçicidir; amaç bitince silinir.

## Model grupları

Şemada olanlar (`prisma/schema.prisma`; alan listesi orada, burada çoğaltılmaz): **Kurum**
(`University`, `Faculty`, `Department`), **kimlik/üyelik/yetki** (`User`, `Membership`, `AdminGrant`,
`MentorProfile`, `AdminAuditLog`) ve **kimlik doğrulama** (aşağıda). Aşağıdakiler henüz yazılmamış modellerin taslağıdır; ilgili adım
birleşince buradan kaldırılır. Bütün tablolarda `id`, `createdAt`, `updatedAt` vardır (yalnız-ekleme
tablosu `AdminAuditLog` `updatedAt` taşımaz). Adlar İngilizce.

**Kimlik ve doğrulama (şemada, P1-02 sözleşmesi):** `Session` · `Account` · `Verification` · `RateLimit`
(Better Auth 1.7 Prisma adaptörünün beklediği alanlar) · `GraduationDocument` · `EmailLog`. `User.role`
yalnız admin eklentisi şeması için vardır ve yetki vermez.

**KVKK ve kontrollü iletişim (şemada, P1-03 sözleşmesi):** `Consent` · `FieldVisibility` ·
`ContactRequest`. Görünürlük kararı yalnız `src/server/rules/visibility.ts` karar tablosundadır.

**Profil:** `Profile` (headline, summary, city, goals, socialLinks JSON, linkedinUrl,
completionScore, cvUpdatedAt, lastFreshnessPromptAt, lastStillThereCheckAt, onboardingStep) ·
`Tag` (kind: `INTEREST` | `SKILL` | `GOAL`) · `ProfileTag` · `Education` · `Position`
(companyId?, companyRaw, titleId?, titleRaw, sectorId?, employmentType, tarihler, isCurrent,
source, manuallyEdited) · `Language` · `Certification` · `CvUpload` (storageKey, status,
parsedJson?, errorCode?, appliedAt?).

**Sözlükler:** `Company` (name, normalizedName, aliases[], sectorId?) · `Sector` · `Title` ·
`UnmatchedValue` (kind, rawValue, normalizedValue, count, resolvedToId?).

**Deneyim:** `Experience` (authorId, departmentIdAtWrite, type, companyId?, organizationName?,
country?, city?, termYear, termSeason, durationWeeks?, pay, applicationChannel, processSteps JSON,
interviewQuestions[], whatLearned, advice, isAnonymous, status, moderationNote?, moderatedById?,
publishedAt?, `searchVector`) · `Report` (targetType, targetId, reporterId, reason, status).

Deneyim türleri: `INTERNSHIP`, `ERASMUS`, `COMPETITION`, `HACKATHON`, `CLUB`, `CERTIFICATE`,
`GRADUATE_STUDY`, `STUDY_ABROAD`. Başvuru kanalları: `LINKEDIN_POST`, `CAREER_PLATFORM`,
`COMPANY_SITE`, `REFERRAL`, `CAREER_FAIR`, `COLD_EMAIL`, `UNIVERSITY_ANNOUNCEMENT`, `OTHER`.

**Mentorluk:** `AvailabilityRule` (mentorId, weekday, startMinute, endMinute, mode) ·
`Appointment` (mentorId, menteeId, startsAt, endsAt, mode, menteeNote, location?, status:
`REQUESTED` | `CONFIRMED` | `DECLINED` | `CANCELLED` | `EXPIRED` | `COMPLETED` | `NO_SHOW`,
meetUrl?, calendarEventId?, cancelledById?, cancelReason?) · `SessionFeedback` (appointmentId,
authorId, happened, helpful?, note?) · `CvReviewRequest` (requesterId, mentorId, cvUploadId,
note, status, reviewText?, helpful?, completedAt?).

**SSS:** `FaqRequest` (askerId, question, status: `OPEN` | `PUBLISHED` | `REJECTED` |
`REDIRECTED`, rejectReason?, faqItemId?) · `FaqAnswer` (requestId, mentorId, body, isSelected) ·
`FaqItem` (question, answer, sourceRequestId, publishedById, `searchVector`).

**Puan:** `PointRule` (action PK, points, delayDays, isActive) · `PointEntry` (userId, action,
sourceType, sourceId, counterpartId?, basePoints, multiplier, points, status: `PENDING` |
`FINAL` | `REVOKED`, finalizesAt?, revokedReason?) · `SuspicionFlag` · `UserBadge` (kind:
`FOUNDING_MEMBER`; Faz 2'de `ALUMNI_OF_YEAR`).

**Bildirim ve metrik:** `NotificationPreference` · `Event` (props'ta
kişisel veri yok). pg-boss kendi şemasını (`pgboss`) kullanır.

## Temel değişmezler

- Bir kullanıcının aynı bölüm ve rolde en fazla bir **aktif** üyeliği vardır (`endedAt` boş) — kısmi
  benzersiz indeks. Farklı bölüm/rolde birden çok etkin üyelik (çoklu rol) serbesttir.
- **Rol ↔ doğrulama yolu** (CHECK): öğrenci yalnız okul e-postasıyla, akademisyen yalnız kurumsal
  e-postayla, mezun yalnız belgeyle doğrulanır; başka her şey `ADMIN` kararıdır. Alan adıyla mezun
  doğrulanamaz. Belge/yönetici ile doğrulanan üyelikte `verifiedById` zorunludur; `verifiedAt` yalnız
  `VERIFIED`'da doludur.
- **Rol geçişi** (öğrenci → mezun) satır **ekler ve kapatır**, silmez: `STUDENT` satırı `endedAt` alır,
  `ALUMNI` satırı eklenir. İçerik ve puan `userId`'ye bağlanır, hiçbir model `Membership`'e yabancı
  anahtarla bağlanmaz (şema testi korur); bu yüzden geçişten etkilenmezler.
- `AdminGrant`: kapsam hedefle uyumludur (`SYSTEM` hedefsiz, `FACULTY` fakülteli, `DEPARTMENT` bölümlü —
  CHECK); aynı kullanıcıya aynı kapsam için en fazla bir etkin yetki; kaldırılan yetki silinmez
  (`revokedAt`+`revokedById`).
- `GraduationDocument`: belge dosyası YALNIZ karar verilene kadar durur — bekleyen satırda `storageKey` dolu ve
  karar alanları boş, karar verilmiş satırda `storageKey` NULL ve karar alanları dolu (CHECK; dosya silinmeden
  onay/ret yazılamaz). Ret gerekçesi yalnız reddedilen satırda (3–1000 karakter). Kullanıcı+bölüm başına tek
  BEKLEYEN belge (kısmi indeks). `Membership`'e yabancı anahtar yoktur: hedef üyelik `userId` + `departmentId` ile bulunur.
- `EmailLog`: gövde ve alıcı adresi tutulmaz (yalnız şablon, alıcı kimliği, durum); `idempotencyKey` benzersizdir;
  `SENT` ile `sentAt` birlikte. Alıcı kullanıcı silinirse kayıt kalır, kimlik boşalır.
- `Session`/`Account` kullanıcıyla birlikte silinir (kimlik doğrulama artığıdır; kullanıcı satırı zaten silinmez,
  anonimleştirilir). `Account.password` kullanılmaz (giriş parolasızdır).
- `MentorProfile`: görüşme süresi 15/20/30 dk; etkin profilin en az bir görüşme biçimi vardır. Kapasite
  ve süre mentorun kararıdır, varsayılanı yoktur.
- `RateLimit`: Better Auth'un hız sınırı deposu; uygulamanın kendi sınırları (iletişim talebi, veri dökümü,
  hesap silme) aynı tabloda `app:` önekli anahtarla, kullanıcı kimliğiyle tutulur (anahtarda kişisel veri yok).
- `Consent`: geri çekme ve yeni sürüm onayı yeni satırdır; bir belgenin geçerli durumu o belge için en son
  satırdır. Rızası olan kullanıcı satırı silinemez (hesap silme anonimleştirir).
- `FieldVisibility`: kullanıcı × alan başına tek satır; satır yoksa varsayılan geçerlidir
  (`src/contracts/privacy.ts`).
- `ContactRequest`: kendine talep yok; NULL olmayan, tek boyutlu listede 1–4 tekrarsız alan; not ≤ 500 karakter; aynı ikili için aynı anda en
  fazla bir açık (bekleyen/onaylı) talep (kısmi indeks). Karar anı yalnız onay/ret/geri alınmış, kapanış anı
  yalnız geri çekilmiş/geri alınmış satırda (CHECK).
- `Consent` ve `AdminAuditLog` yalnız eklenir; güncellenmez, silinmez (hesap silmede audit
  satırı kişisel alan içermediği için kalır). İkisi için de bu, veritabanı tetikleyicisiyle
  zorlanır (UPDATE, DELETE ve TRUNCATE reddedilir); `recordAdminAction` ise eylemle aynı işlemde yazar.
- `GraduationDocument.storageKey` karar verilen satırda `null`'dır ve dosya depoda yoktur.
- Aynı mentor için `REQUESTED`/`CONFIRMED` randevuların zaman aralıkları çakışamaz
  (exclusion constraint, `btree_gist`, ham SQL migration).
- `PointEntry` (userId, action, sourceType, sourceId) benzersizdir; aynı olay iki kez puan
  üretemez.
- `SessionFeedback` (appointmentId, authorId) benzersizdir.
- Anonim `Experience`'ın yazarı hiçbir istemci yanıtına çıkmaz; yalnız moderasyon ekranında
  yöneticiye görünür.
- Açık bir `CvReviewRequest`'in bağlı olduğu `CvUpload` dosyası silinmez.
- Sınıf saklanmaz; `entryYear` + `classOffset`'ten hesaplanır (`src/server/rules/classYear.ts`: akademik yıl
  Eylül'de başlar, düzeltme −3…+3, hazırlık/uzatma ayrı durum).
- `Event.props` ve `AdminAuditLog.metadata` kişisel veri içermez.

## Transaction ve eşzamanlılık

- CV uygulama, randevu onayı (kapasite + çakışma), SSS yayını (puanlarla birlikte) ve hesap silme
  tek işlemde (transaction) yapılır.
- Kapasite kontrolü onay işleminin içinde yapılır; çakışmanın son sözü veritabanı kısıtıdır.
- Puan yazımı benzersiz anahtarla idempotenttir; işler yeniden çalışabilir.

## Migration politikası

- Ekleyici önce (genişlet → daralt). Veri değiştiren/silen migration H3'tür ve PR'da geri alma
  adımı vardır.
- Prisma'nın ifade edemediği kısıtlar (exclusion constraint, kısmi benzersizlik, üretilmiş
  `tsvector`, uzantılar) ham SQL migration'ında, yorumla.
- Her migration boş veritabanında ve seed'li veritabanında koşulur.
- Canlıya alımdan sonra H3 migration'ından önce yedek doğrulanır.

## Veri güvenliği ve saklama

- Mezun belgesi karar anında silinir. CV'de son dosya tutulur; eski dosyalar uygulama anında
  silinir (açık incelemeye bağlı olan hariç). Ayrıştırma çıktısı uygulama/atma anında temizlenir.
- `EmailLog` 6 ay; `Event` 24 ay sonra kullanıcıdan koparılır (userId `null`).
- Hesap silmede kişisel alanlar anında temizlenir, dosyalar silinir; yayınlanmış içerik kullanıcının
  seçimine göre silinir (varsayılan) ya da yazar bağı koparılarak kalır (K-09, `docs/decisions.md`).
