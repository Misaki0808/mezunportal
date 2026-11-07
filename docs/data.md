# Veri mimarisi ve değişmezler

Son güncelleme: **2026-11-07** (kod öncesi taslak).

Şema yazıldıktan sonra model, alan, enum, indeks ve ilişki için tek doğruluk kaynağı
`prisma/schema.prisma`; değişim geçmişi `prisma/migrations/`'tır. Aşağıdaki “Model grupları”
bölümü yalnız ilk sözleşme PR'larına yön verir; P1-01 birleşince bu bölüm kısaltılır ve belgede
yalnız sahiplik, değişmezler ve politikalar kalır.

## Veri sahipliği

- Kişisel veri kullanıcıya aittir; görünürlüğünü kullanıcı belirler (`docs/security.md`).
- Yayınlanmış deneyim ve SSS platformun içeriğidir; yazarın kimliği anonim içerikte hiçbir
  yanıtta yer almaz.
- Kurum yapısı (üniversite → fakülte → bölüm) ve sözlükler (şirket, sektör, unvan) sistem
  yöneticisinindir.
- Ayrıştırma çıktısı, belge ve eski CV geçicidir; amaç bitince silinir.

## Model grupları (ilk taslak)

Bütün tablolarda `id`, `createdAt`, `updatedAt` vardır. Adlar İngilizce.

**Kurum:** `University` (name, shortName, studentEmailDomains[], staffEmailDomains[]) ·
`Faculty` (universityId, name) · `Department` (facultyId, name, code).

**Kimlik (Better Auth):** `User` (email, emailVerified, name, image, phone?, lastSeenAt; ban
alanları Better Auth admin eklentisinden) · `Session` · `Account` · `Verification`.

**Üyelik ve yetki:**
- `Membership` — userId, departmentId, role (`STUDENT` | `ALUMNI` | `ACADEMIC`), entryYear?,
  classOffset? (hazırlık/uzatma düzeltmesi), graduationYear?, verificationStatus (`PENDING` |
  `VERIFIED` | `REJECTED`), verificationMethod (`STUDENT_EMAIL` | `STAFF_EMAIL` |
  `GRADUATION_DOCUMENT` | `ADMIN`), verifiedAt, verifiedById, endedAt?
- `AdminGrant` — userId, scope (`SYSTEM` | `FACULTY` | `DEPARTMENT`), facultyId?, departmentId?,
  grantedById
- `AdminAuditLog` — actorId, action, targetType, targetId, reason?, metadata (JSON, kişisel
  veri yok), createdAt — append-only
- `MentorProfile` — userId (PK), isActive, monthlyCapacity, sessionMinutes, meetingModes,
  inPersonNote?, pausedUntil?, cvReviewEnabled, cvReviewMonthlyLimit
- `GraduationDocument` — userId, storageKey? (karar anında `null`), status, reviewedById,
  reviewedAt, rejectReason?

**KVKK:** `Consent` (userId, documentType, version, granted; append-only) ·
`FieldVisibility` (userId, field, level; benzersiz userId+field) · `ContactRequest`
(requesterId, targetId, fields[], message?, status, decidedAt).

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

**Bildirim ve metrik:** `NotificationPreference` · `EmailLog` (gövdesiz) · `Event` (props'ta
kişisel veri yok). pg-boss kendi şemasını (`pgboss`) kullanır.

## Temel değişmezler

- Bir kullanıcının aynı bölüm ve rolde en fazla bir **aktif** üyeliği vardır (`endedAt` boş).
- `Consent` ve `AdminAuditLog` yalnız eklenir; güncellenmez, silinmez (hesap silmede audit
  satırı kişisel alan içermediği için kalır).
- `GraduationDocument.storageKey` karar verilen satırda `null`'dır ve dosya depoda yoktur.
- Aynı mentor için `REQUESTED`/`CONFIRMED` randevuların zaman aralıkları çakışamaz
  (exclusion constraint, `btree_gist`, ham SQL migration).
- `PointEntry` (userId, action, sourceType, sourceId) benzersizdir; aynı olay iki kez puan
  üretemez.
- `SessionFeedback` (appointmentId, authorId) benzersizdir.
- Anonim `Experience`'ın yazarı hiçbir istemci yanıtına çıkmaz; yalnız moderasyon ekranında
  yöneticiye görünür.
- Açık bir `CvReviewRequest`'in bağlı olduğu `CvUpload` dosyası silinmez.
- Sınıf saklanmaz; `entryYear` + `classOffset`'ten hesaplanır.
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
- Hesap silmede kişisel alanlar anında temizlenir, dosyalar silinir; yayınlanmış içeriğin akıbeti
  K-09.
