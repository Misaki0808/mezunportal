/**
 * E-posta alan adı kuralları (D2, K-06). Alan adı ÜNİVERSİTEYİ doğrular, bölümü doğrulamaz. Değerler
 * sabit değil `University` kaydından gelir (`studentEmailDomains`, `staffEmailDomains`).
 *
 * Eşleşme TAM eşleşmedir (büyük/küçük harf duyarsız, sondaki nokta atılır): `ogr.iu.edu.tr` kayıtlıysa
 * `x.ogr.iu.edu.tr` ve `evil-ogr.iu.edu.tr` eşleşmez. Alt alan adları kendiliğinden güvenilir sayılmaz.
 */

export type UniversityDomains = {
  studentEmailDomains: readonly string[];
  staffEmailDomains: readonly string[];
};

export type EmailKind = 'STUDENT_DOMAIN' | 'STAFF_DOMAIN' | 'OTHER';

/** `a@B.com` → `b.com`; adres geçersizse `null`. Son `@`'ten sonrasını alır. */
export function emailDomainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  return domain === '' ? null : domain;
}

function normalizeDomains(domains: readonly string[]): Set<string> {
  return new Set(domains.map((domain) => domain.trim().toLowerCase().replace(/\.$/, '')));
}

export type DomainMatch = { student: boolean; staff: boolean };

export function matchEmailDomain(email: string, university: UniversityDomains): DomainMatch {
  const domain = emailDomainOf(email);
  if (domain === null) return { student: false, staff: false };
  return {
    student: normalizeDomains(university.studentEmailDomains).has(domain),
    staff: normalizeDomains(university.staffEmailDomains).has(domain),
  };
}

/**
 * Bu üniversite, bu e-postayla hangi üyelik türünü alan adıyla doğrulayabilir? Mezun (`ALUMNI`) asla
 * buradan çıkmaz: alan adıyla mezun doğrulanamaz.
 */
export function selfVerifiableRoles(
  email: string,
  university: UniversityDomains,
): ('STUDENT' | 'ACADEMIC')[] {
  const match = matchEmailDomain(email, university);
  return [
    ...(match.student ? (['STUDENT'] as const) : []),
    ...(match.staff ? (['ACADEMIC'] as const) : []),
  ];
}

/**
 * Ekranın hangi doğrulama yolunu göstereceği için e-postanın sınıfı. Aynı alan adı hem öğrenci hem
 * personel listesinde ise `STUDENT_DOMAIN` döner (beyan eylemi iki rolü de kabul eder).
 */
export function emailKindOf(email: string, universities: readonly UniversityDomains[]): EmailKind {
  let staff = false;
  for (const university of universities) {
    const match = matchEmailDomain(email, university);
    if (match.student) return 'STUDENT_DOMAIN';
    staff ||= match.staff;
  }
  return staff ? 'STAFF_DOMAIN' : 'OTHER';
}
