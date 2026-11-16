import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Hukuki metin bekçisi (kart 394, #182 incelemesi P3-5; #196 incelemesi P2 ve P3). Kullanıcı kararı K-03: veri sorumlusu proje
 * sahibidir (gerçek kişi, adı metinde yazılı), iletişim ve başvuru adresi MezunPortal platform hesabıdır, kişisel adres hiçbir
 * metinde geçmez. Ekrandaki katalog (`messages/tr.json`) ve taslak belge (`docs/legal-drafts.md`) bu sonucu birlikte taşır; bu
 * test kararı göz yerine kodla tutar.
 *
 * Veri sorumlusunun adı teste yazılmaz, metinden okunur. Platform hesabı ise kişisel değil, herkese açık proje hesabıdır (K-03'te
 * yazılı); tek bir sabitte tutulur ve bulunan her adres ona BİREBİR eşit olmalıdır. Marka önekine bakmak yetmez: önek taşıyan
 * bir kişisel adres (`mezunportal-…@…`) de yakalanmalıdır.
 */
type Section = { title: string; body?: string; items?: Record<string, string> };
type Catalog = {
  privacyScreens: { documents: Record<string, { sections: Record<string, Section> }> };
};

const raw = readFileSync(new URL('../../messages/tr.json', import.meta.url), 'utf8');
const drafts = readFileSync(new URL('../../docs/legal-drafts.md', import.meta.url), 'utf8');
const documents = (JSON.parse(raw) as Catalog).privacyScreens.documents;

/** K-03: iletişim ve başvuru adresi. Değişirse karar kaydıyla birlikte burada da bilinçli olarak güncellenir. */
const PLATFORM_ACCOUNT = 'mezunportal.iu@gmail.com';
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const CONTROLLER =
  /^(?<name>\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+)+) \(gerçek kişi[^)]*\)\.\s*İletişim: (?<contact>\S+@\S+?) \(/u;

const section = (document: string, key: string): Section => {
  const found = documents[document]?.sections[key];
  if (!found) throw new Error(`Katalogda yok: ${document}.${key}`);
  return found;
};
const addressesIn = (text: string) => [...text.matchAll(EMAIL)].map((match) => match[0]);

describe('hukuki metinler: K-03 sonucu (veri sorumlusu ve platform iletişim adresi)', () => {
  const notice = section('PRIVACY_NOTICE', 'section1').body ?? '';
  const controller = CONTROLLER.exec(notice)?.groups;

  it('aydınlatma §1: gerçek kişi olan veri sorumlusunun adı yazılı, iletişim adresi platform hesabıyla birebir aynı', () => {
    expect(controller, `§1 beklenen biçimde değil: ${notice}`).toBeDefined();
    expect(controller?.contact).toBe(PLATFORM_ACCOUNT);
  });

  it('aydınlatma §8: başvuru adresi yalnız platform hesabı', () => {
    const rights = section('PRIVACY_NOTICE', 'section8').body ?? '';
    expect(addressesIn(rights)).toEqual([PLATFORM_ACCOUNT]);
  });

  it('taslak belge (`docs/legal-drafts.md`) ekranla aynı ad ve platform adresini taşır', () => {
    expect(controller?.name).toBeTruthy();
    expect(drafts).toContain(`${controller?.name} (gerçek kişi`);
    expect(drafts).toContain(`İletişim: ${PLATFORM_ACCOUNT}`);
    expect(drafts).toContain(`Başvuru: ${PLATFORM_ACCOUNT}.`);
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

  it('bütün katalogda (rıza açıklamaları dahil) ve taslak belgede e-posta adresi yalnız platform hesabı', () => {
    const catalog = addressesIn(raw);
    const draft = addressesIn(drafts);
    expect(catalog.length, 'katalogda platform adresi bulunamadı').toBeGreaterThan(0);
    expect(draft.length, 'taslak belgede platform adresi bulunamadı').toBeGreaterThan(0);
    expect([...catalog, ...draft].filter((address) => address !== PLATFORM_ACCOUNT)).toEqual([]);
  });
});
