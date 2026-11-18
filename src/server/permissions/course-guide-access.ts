/**
 * "Ders rehberi" yalnız doğrulanmış, süren ÖĞRENCİ üyeliğine açıktır (`getCourseGuide` yalnız `STUDENT` kabul eder).
 * Hesap ayarları sayfası ve gezinme kabuğu aynı koşulu buradan alır; iki yer ayrışmasın (kart 457). Yetkiyi genişletmez:
 * yalnız bağlantının görünmesini erişimle aynı kurala bağlar, sayfa ve eylem kendi korumasını yine uygular.
 */
export function canUseCourseGuide(facts: {
  memberships: ReadonlyArray<{
    role: string;
    verificationStatus: string;
    endedAt: Date | null;
  }>;
}): boolean {
  return facts.memberships.some(
    (membership) =>
      membership.role === 'STUDENT' &&
      membership.verificationStatus === 'VERIFIED' &&
      membership.endedAt === null,
  );
}
