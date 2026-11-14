// Sahte/örnek veri sabitleri. Kurum değerleri TEK YERDE burada durur.
//
// K-06 KISMEN TEYİTLİ: öğrenci e-posta alanı (ogr.iu.edu.tr) kullanıcının kendi hesabıyla doğrulandı.
// Personel e-posta alanı, YBS'nin fakültesi ve program dili kaynaktan zayıf ölçüldü, kullanıcı teyidi
// bekleniyor (BACKLOG.md K-06). Teyitte yalnız bu dosya değişir. İÜ-Cerrahpaşa (iuc.edu.tr) ayrı
// üniversitedir ve seed'e girmez.

export const INSTITUTION_SEED = {
  university: {
    name: 'İstanbul Üniversitesi',
    shortName: 'İÜ',
    studentEmailDomains: ['ogr.iu.edu.tr'],
    staffEmailDomains: ['istanbul.edu.tr'],
  },
  faculty: {
    name: 'İktisat Fakültesi',
  },
  department: {
    name: 'Yönetim Bilişim Sistemleri',
    code: 'YBS',
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Rol başına test kullanıcıları (P1-01). SAHTE kişiler; e-postalar gerçek alan adında DEĞİLDİR
// (`.local` alan adı hiçbir yere teslim edilmez). Giriş bilgisi yoktur: test girişi P1-02'de gelir ve
// bilgiler Git dışı `korunan/test-hesaplari.md`'de tutulur. Giriş yılları sabittir (seed her çalışmada
// aynı veriyi üretir); sınıf saklanmadığı için zamanla kendiliğinden ilerler.
// ---------------------------------------------------------------------------------------------

export const TEST_EMAIL_DOMAIN = 'test.mezunportal.local';

export const TEST_PERSONAS = {
  student: {
    name: 'Deniz Aksoy',
    email: `student@${TEST_EMAIL_DOMAIN}`,
    role: 'STUDENT',
    entryYear: 2026,
  },
  seniorMentor: {
    name: 'Elif Kaya',
    email: `senior-mentor@${TEST_EMAIL_DOMAIN}`,
    role: 'STUDENT',
    entryYear: 2023,
    mentor: {
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE', 'IN_PERSON'],
      inPersonNote: 'Kampüste buluşulur.',
      cvReviewEnabled: true,
      cvReviewMonthlyLimit: 2,
    },
  },
  alumniMentor: {
    name: 'Mert Yıldız',
    email: `alumni-mentor@${TEST_EMAIL_DOMAIN}`,
    role: 'ALUMNI',
    entryYear: 2018,
    graduationYear: 2022,
    mentor: {
      monthlyCapacity: 6,
      sessionMinutes: 20,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      cvReviewEnabled: true,
      cvReviewMonthlyLimit: 3,
    },
  },
  academic: {
    name: 'Selin Arslan',
    email: `academic@${TEST_EMAIL_DOMAIN}`,
    role: 'ACADEMIC',
  },
  departmentAdmin: {
    name: 'Kerem Demir',
    email: `department-admin@${TEST_EMAIL_DOMAIN}`,
    role: 'ACADEMIC',
    grant: 'DEPARTMENT',
  },
  systemAdmin: {
    name: 'Sistem Yöneticisi',
    email: `system-admin@${TEST_EMAIL_DOMAIN}`,
    role: 'ACADEMIC',
    grant: 'SYSTEM',
  },
} as const;

export type TestPersonaKey = keyof typeof TEST_PERSONAS;
