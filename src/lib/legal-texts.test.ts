import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Hukuki metin bekçisi (kart 394, #182 incelemesi P3-5). Kullanıcı kararı K-03: veri sorumlusu proje sahibidir (gerçek kişi, adı
 * metinde yazılı), iletişim ve başvuru adresi MezunPortal platform hesabıdır, kişisel adres hiçbir metinde geçmez. Ekrandaki
 * katalog (`messages/tr.json`) ve taslak belge (`docs/legal-drafts.md`) bu sonucu birlikte taşır; bu test kararı göz yerine
 * kodla tutar. Ad ve adres teste yazılmaz: metinden okunur, platform hesabı marka önekiyle tanınır.
 */
type Section = { title: string; body?: string; items?: Record<string, string> };
type Catalog = {
  privacyScreens: { documents: Record<string, { sections: Record<string, Section> }> };
};

const raw = readFileSync(new URL('../../messages/tr.json', import.meta.url), 'utf8');
const drafts = readFileSync(new URL('../../docs/legal-drafts.md', import.meta.url), 'utf8');
const documents = (JSON.parse(raw) as Catalog).privacyScreens.documents;

/** Platform hesabının adres öneki: marka adı. Kişisel bir adres bu önekle başlamaz. */
const PLATFORM_ACCOUNT_PREFIX = 'mezunportal';
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const CONTROLLER =
  /^(?<name>\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+)+) \(gerçek kişi[^)]*\)\.\s*İletişim: (?<contact>\S+@\S+?) \(/u;

const section = (document: string, key: string): Section => {
  const found = documents[document]?.sections[key];
  if (!found) throw new Error(`Katalogda yok: ${document}.${key}`);
  return found;
};
const textOf = (value: Section) =>
  [value.title, value.body ?? '', ...Object.values(value.items ?? {})].join('\n');
const allLegalText = Object.values(documents)
  .flatMap((document) => Object.values(document.sections).map(textOf))
  .join('\n');

describe('hukuki metinler: K-03 sonucu (veri sorumlusu ve platform iletişim adresi)', () => {
  const notice = section('PRIVACY_NOTICE', 'section1').body ?? '';
  const controller = CONTROLLER.exec(notice)?.groups;

  it('aydınlatma §1: gerçek kişi olan veri sorumlusunun adı ve platform iletişim adresi yazılı', () => {
    expect(controller, `§1 beklenen biçimde değil: ${notice}`).toBeDefined();
    expect(controller?.contact?.toLowerCase().startsWith(PLATFORM_ACCOUNT_PREFIX)).toBe(true);
  });

  it("aydınlatma §8: başvuru adresi dolu ve §1'deki iletişim adresiyle aynı", () => {
    const rights = section('PRIVACY_NOTICE', 'section8').body ?? '';
    expect(rights.match(EMAIL)).toEqual([controller?.contact]);
  });

  it('taslak belge (`docs/legal-drafts.md`) ekranla aynı ad ve adresi taşır', () => {
    expect(controller?.name).toBeTruthy();
    expect(drafts).toContain(`${controller?.name} (gerçek kişi`);
    expect(drafts).toContain(`İletişim: ${controller?.contact}`);
    expect(drafts).toContain(`Başvuru: ${controller?.contact}.`);
  });

  it('kullanım şartları §1: işleten aynı adla yazılı', () => {
    const terms = section('TERMS_OF_USE', 'section1').body ?? '';
    expect(controller?.name).toBeTruthy();
    expect(terms).toContain(`Platformu işleten: ${controller?.name} (gerçek kişi)`);
  });

  it('staj arayan görünürlüğü ekranı veri sorumlusu ve iletişim adresinin aydınlatma metninde olduğunu söyler (belge §4 ile aynı anlam)', () => {
    const body = section('JOB_SEEKER_VISIBILITY', 'section4').body ?? '';
    expect(body).toContain('Veri sorumlusu ve iletişim adresi');
    expect(body).toContain('aydınlatma metninde');
    expect(drafts).toContain('### 4. Veri sorumlusu ve iletişim');
  });

  it('K-03 yer tutucusu ne ekranda ne taslak belgede kalmış', () => {
    expect(raw).not.toContain('[K-03');
    expect(drafts).not.toContain('[K-03');
  });

  it('hiçbir hukuki metinde kişisel e-posta yok: yalnız platform hesabı, tek adres', () => {
    const addresses = [...allLegalText.matchAll(EMAIL)].map((match) => match[0].toLowerCase());
    const draftAddresses = [...drafts.matchAll(EMAIL)].map((match) => match[0].toLowerCase());
    for (const address of [...addresses, ...draftAddresses])
      expect(
        address.startsWith(PLATFORM_ACCOUNT_PREFIX),
        `kişisel adres olabilir: ${address}`,
      ).toBe(true);
    expect(new Set([...addresses, ...draftAddresses]).size).toBe(1);
  });
});
