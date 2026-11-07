// Sahte/örnek veri sabitleri. Kurum değerleri TEK YERDE burada durur.
//
// K-06 GEÇİCİ: e-posta alan adları ve YBS'nin fakültesi kaynaktan zayıf ölçüldü, kullanıcı teyidi
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
