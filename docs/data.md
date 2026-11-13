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

**CV hattı (şemada, P1-05):** `CvUpload` (durum, dosya anahtarı, doğrulanmış ayrıştırma çıktısı yalnız `PARSED`'da) ·
profil kalemleri `Education` · `Position` · `Language` · `Certification` (`source`: `CV`/`MANUAL`,
`manuallyEdited` korumalı kalemdir); beceri `Tag(SKILL)` + `ProfileTag`'tir (`Tag.label` zorunlu, `curated = false`
kişisel/serbest metin etiketidir ve öneri listesinde yer almaz; eski `UserSkill` BACKLOG TD-013) · sözlükler `Company` · `Title` · `Skill` · `Sector` (+ `UnmatchedValue`
yönetici kuyruğu) · `ExperienceInvitation`. Kalemler `User`'a bağlıdır (`Profile`'a değil). `Skill` sözlüğü yalnız beceri adı eşleme/standartlaştırma içindir.
`Profile.manualFields` kullanıcının elle düzenlediği başlık/özet/şehirdir; yeni CV bunları sessizce ezmez.

**Profil (P1-04 şemasında):** `Profile`, `Tag`, `ProfileTag`; kullanıcı ve etiket ilişkileri için
kanonik kaynak Prisma şemasıdır. Profil içeriğinin hesap silmeye ve veri dökümüne bağlanması servis
uygulamasının zorunlu parçasıdır; kullanıcı hesabı satırı silinmediğinden cascade tek başına yeterli değildir.
İlk giriş adım durumu `Profile.completedSteps` / `skippedSteps` ile açıkça tutulur (ikisinde de yoksa
bekliyor); listeler ayrıktır, zorunlu adım atlanamaz (`Profile_step_status_check`). Atlama veriyi silmez.

**Deneyim ve şikâyet (P1-07 şemasında):** `Experience`, `Report`. Alan/enum/indekslerin tek kaynağı
Prisma şemasıdır; tür bazlı alanlar ve taslak/yayına hazır ayrımı `src/contracts/experience.ts`'tedir.
Taslak eksik olabilir; gönderimden itibaren türün zorunlu alanları ve moderasyon kararının tutarlılığı
SQL CHECK'lerle korunur. `interviewQuestions` NULL olmayan tek boyutlu bir dizidir; JSON başvuru
adımları kapalı nesnelerden oluşur. Aynı kişi/hedef için tek açık şikâyet kısmi benzersiz indeksle korunur.
Şimdilik şikâyetin tek hedef türü deneyimdir ve FK ile bağlıdır; SSS kendi sözleşmesinde genişletir.
`Company` sözlüğü P1-05 ile vardır; deneyimin `companyId` FK bağlantısını P1-08 ekler. Arama vektörü/indeksi de P1-08'dedir.


**Mentorluk:** `AvailabilityRule` (mentorId, weekday, startMinute, endMinute, mode) ·
`Appointment` (mentorId, menteeId, startsAt, endsAt, mode, menteeNote, location?, status:
`REQUESTED` | `CONFIRMED` | `DECLINED` | `CANCELLED` | `EXPIRED` | `COMPLETED` | `NO_SHOW`,
meetUrl?, calendarEventId?, cancelledById?, cancelReason?) · `SessionFeedback` (appointmentId,
authorId, happened, helpful?, note?) · `CvReviewRequest` (requesterId, mentorId, cvUploadId,
note, status, reviewText?, helpful?, completedAt?).

**SSS:** `FaqRequest` (askerId?, departmentIdAtWrite, question, status: `OPEN` | `PUBLISHED` | `REJECTED` |
`REDIRECTED`, decisionNote?, decidedAt?) · `FaqAnswer` (requestId, mentorId?, body, isSelected) · `FaqItem` (sourceRequestId,
departmentIdAtWrite, question, answer, publishedById, üretilmiş `searchVector`/`searchKeys`). `askerId`/`mentorId` yalnız sahiplik
içindir; hesap silmede koparılır ve hiçbir çıktıya girmez.

**Puan:** `PointRule` (action PK, points, delayDays, isActive) · `PointEntry` (userId, action,
sourceType, sourceId, counterpartId?, basePoints, multiplierPercent, points, eventAt, status: `PENDING` |
`FINAL` | `REVOKED`, finalizesAt?, revokedReason?) · `SuspicionFlag` (userId, rule, status, evidenceKey, entryIds)
· `UserBadge` (kind: `FOUNDING_MEMBER`; Faz 2'de `ALUMNI_OF_YEAR`; `sourceEntryId` geri alınca etiket düşer).

**Bildirim ve metrik:** `NotificationPreference` · `Event` (props'ta
kişisel veri yok). pg-boss kendi şemasını (`pgboss`) kullanır.

**Faz 2 (P2-01…P2-13; ayrıntı `prisma/schema.prisma`):** `JobPosting` (+ `JobPostingDepartment`, `JobPostingTag`, `JobPostingReport`, `JobMatch`/`JobMatchDigest`:
yazar, hedef bölümler, sözlükten en çok 5 etiket, son tarih ≤ yayından 60 gün) · `ReferralClaim` (kanıt zinciri; puan ve iki aşamalı onay) · `Profile`
aday alanları (`seekingInternship`, `seekerRef` opak ve benzersiz, `seekerViewCount`, `hiringDeclaredAt`) ve `ContactRequest.source`
(`PROFILE` | `JOB_POSTING` | `SEEKER_PROFILE`; kaynak özeti talepte kalır) · `Company` (+ `CompanyMerge`, `CompanyFollow`) · `CampusEvent` (+ departmanlar,
`CampusEventRegistration`, `EventAttendance`) · `AwardCycle`/`Award`/`AwardCandidate`/`AwardPublicationDecision`, `AlumniStory`/`StoryConsentDecision`/`MonthlyAlumnus` ·
`Experience.appliedMonth` (yalnız staj; başvuru takvimi için) · `IntegrationConnection` (Google yenileme jetonu şifreli; sağlayıcı başına tek satır).
Soru bankası, beceri açığı ve takvim kesitleri **ayrı tablo tutmaz**: yayınlanmış deneyimden sorgu anında görünürlük ve eşikle türer.
Rıza belgeleri `ConsentDocument` değerleridir (`JOB_SEEKER_VISIBILITY` isteğe bağlı, sürümlü; ödül/hikâye yayın kararları kendi karar tablolarında).

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
- Aynı mentor için `REQUESTED`/`CONFIRMED` randevuların zaman aralıkları çakışamaz; aynı öğrenci için de
  (exclusion constraint, `btree_gist`, ham SQL migration). Aynı öğrencinin aynı mentora yanıt bekleyen en fazla bir
  talebi olur (kısmi benzersiz indeks). `AvailabilityRule` aralıkları aynı mentor+gün için çakışamaz (exclusion).
  `Appointment.expiresAt` yalnız `REQUESTED` için anlamlıdır (D11); `calendarFailedAt` doluysa mentor linki elle ekler.
- `FaqRequest` karar alanları durumla tutarlıdır (CHECK); bir talepte en çok bir seçilmiş `FaqAnswer` (kısmi benzersiz indeks); talep
  başına tek `FaqItem`. Arama sütunları `Experience` ile aynı kuralla üretilir (migration bekçisi izin listesinde).
- `JobPosting` (P2-04; ilan): `departmentIdAtWrite` moderasyon kapsamıdır, hedef bölümler `JobPostingDepartment`'tadır. Durum ↔ karar/yayın/bitiş
  alanları, DRAFT dışında tam içerik, https-yalnız başvuru bağlantısı ve "son başvuru yayın gününden (İstanbul) en çok 60 gün sonra" CHECK'lerle
  zorlanır; aynı kullanıcı/ilan için tek AÇIK `JobPostingReport` vardır (kısmi benzersiz indeks). Arama sütunları `Experience` ile aynı kuralla
  üretilir (migration bekçisi izin listesinde). Puan: `JOB_POSTING_PUBLISHED` (5 puan, 7 gün gecikmeli, ayda 3 ilan).
- `PointEntry` (userId, action, sourceType, sourceId) benzersizdir; aynı olay iki kez puan
  üretemez.
  Puan = taban × çarpan / 100 (CHECK); durum alanları tutarlıdır (PENDING → `finalizesAt`, REVOKED → neden + an; CHECK).
  Aynı (kullanıcı, kural) için en çok bir `OPEN` `SuspicionFlag` vardır (kısmi benzersiz indeks); işaret açıkken aynı kural için
  görülen YENİ kanıt yeni işaret açmaz, işarete `recurrenceCount` + `lastSeenAt` (+ en çok 5 sayısal özet, en çok 20 tekrar anahtarı)
  olarak eklenir. `sourceId` ve karşı taraf hiçbir
  istemci çıktısına girmez.
- `SessionFeedback` (appointmentId, authorId) benzersizdir.
- Anonim `Experience`'ın yazarı kendi listesi ve moderasyon dahil hiçbir istemci yanıtına çıkmaz.
  Sahiplik kimliği yalnız sunucuda saklanır; hesap anonimleştirmede yayınlanmış içerikten koparılabilir.
- Açık bir `CvReviewRequest`'in bağlı olduğu `CvUpload` dosyası silinmez.
- Sınıf saklanmaz; `entryYear` + `classOffset`'ten hesaplanır (`src/server/rules/classYear.ts`: akademik yıl
  Eylül'de başlar, düzeltme −3…+3, hazırlık/uzatma ayrı durum).
- `Event.props` ve `AdminAuditLog.metadata` kişisel veri içermez. `Event.props` ek olarak veritabanı CHECK'iyle sınırlıdır
  (düz nesne, ≤ 500 karakter, `@` ve 10+ ardışık rakam yok). `Event.role`/`departmentId` olay anının anlık görüntüsüdür;
  `userId` hesap silmede hemen, 24 ay sonra (`detachOldEvents`) `null` olur, satırlar ve sayılar kalır.

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

### Faz 2 migration geri alma tablosu

Hepsi **ekleyicidir** (yeni tablo, sütun, enum değeri; var olan veri değişmez) ve temiz veritabanında sırayla uygulanır (`migrations.db.test.ts` ve taze veritabanı denemesi).
Genel kural: tablolar yabancı anahtar sırasının tersinde (çocuk önce) `DROP TABLE` ile kaldırılır; **PostgreSQL enum değeri kaldırılamaz**: geri almada değer kalır,
o değeri kullanan satır yoksa zararsızdır (varsa önce satırlar silinir/geri alınır, ileri onarım). Üretilmiş sütun/GIN indeksi tablodan önce düşer. Veri taşıyan geri alma
kullanıcı verisini siler; PR'da onay ister. `p2_04_*`, `p2_06_*`, `contact_request_context*` ve `integration_connection` migration'ları geri alma notunu kendi başlarında taşır.

| Migration | Ekler | Geri alma (özet) |
|---|---|---|
| `job_matching` | `JobPostingTag`, `JobPosting.targetGrades`, `NotificationType.JOB_MATCH` | `DROP TABLE "JobPostingTag"`; `ALTER TABLE "JobPosting" DROP COLUMN "targetGrades"`; enum değeri kalır |
| `job_match_notifications` | `JobMatch`, `JobMatchDigest` | iki tablo `DROP TABLE` (eşleşme geçmişi silinir) |
| `p2_03_referral` | `ReferralStatus`, `ReferralClaim`, `PointSourceType`/`PointRevokeReason` değerleri | `DROP TABLE "ReferralClaim"; DROP TYPE "ReferralStatus"`; referans puanı kayıtları önce geri alınır; enum değerleri kalır |
| `p2_03_referral_suspicion` | `SuspicionRule.REFERRAL_REPEAT/BURST` | yalnız enum değeri: kalır; açık işaret varsa karar verilir |
| `p2_09_company_search` | `CompanyMerge`, `Company.searchKeys` (üretilmiş) + trigram GIN | önce indeks ve sütun, sonra `DROP TABLE "CompanyMerge"` (birleştirme yönlendirmesi kaybolur) |
| `p2_11_application_window` | `CompanyFollow`, `Experience.appliedMonth` + CHECK, `NotificationType.APPLICATION_WINDOW` | CHECK ve sütun düşer (başvuru ayı verisi silinir), `DROP TABLE "CompanyFollow"` |
| `p2_07_target_title` | `Profile.targetTitleId` | `DROP COLUMN` (hedef pozisyon seçimi silinir) |
| `p2_01_year_alumni` | `AwardKind`, `AwardCycle`, `AwardCandidate`, `Award` | tablolar tersten `DROP TABLE`, sonra `DROP TYPE "AwardKind"` |
| `p2_01_award_consent` / `_version` | `AwardPublicationDecision`, koruma işlevi/tetikleyici, `Award.publicConsentVersion` | tetikleyici + işlev, sütun, tablo sırasıyla düşer |
| `p2_02_alumni_story` | `AlumniStoryStatus`, `AlumniStory`, `StoryConsentDecision`, `MonthlyAlumnus` | tablolar tersten `DROP TABLE`, sonra `DROP TYPE` |
| `p2_13_monthly_digest` | `NotificationType.MONTHLY_DIGEST` | yalnız enum değeri: kalır |
| `p2_12_campus_events` | `CampusEventStatus`, `CampusEvent`, `CampusEventDepartment`, `CampusEventRegistration`, `EventAttendance`, puan/şüphe enum değerleri | tablolar tersten `DROP TABLE`, `DROP TYPE "CampusEventStatus"`; etkinlik puan kayıtları önce geri alınır |
| `p2_08_course_guide` | `Course`, `AlumniCourseMark` | iki tablo `DROP TABLE` (mezun ders işaretleri silinir) |

## Veri güvenliği ve saklama

- Mezun belgesi karar anında silinir. CV'de son dosya tutulur; eski dosyalar uygulama anında
  silinir (açık incelemeye bağlı olan hariç). Ayrıştırma çıktısı uygulama/atma anında temizlenir.
- `NotificationIntent` kalıcı hataları (`FAILED`), `failedAt` üzerinden 90 günü aşınca günlük işte silinir; diğer durumlar bu temizliğe girmez.
- `EmailLog` 6 ay; `Event` 24 ay sonra kullanıcıdan koparılır (userId `null`).
- Hesap silmede kişisel alanlar anında temizlenir, dosyalar silinir; yayınlanmış içerik kullanıcının
  seçimine göre silinir (varsayılan) ya da yazar bağı koparılarak kalır (K-09, `docs/decisions.md`).
