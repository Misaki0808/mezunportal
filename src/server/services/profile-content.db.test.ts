import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { myProfileSchema, profileViewSchema } from '@/contracts/profile-content';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import * as content from './profile-content';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

let inst: Institution;
let other: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
  other = await createInstitution(db);
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}); gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
}
const student = async (
  institution: Institution = inst,
  overrides: Parameters<typeof createUser>[1] = {},
) => {
  const userId = await createUser(db, overrides);
  await addMembership(db, {
    userId,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  return userId;
};
const tag = () => `zx${randomUUID().replace(/-/g, '').slice(0, 10)}`;

// =============================================================================================
// Kendi profilim
// =============================================================================================
describe('getMyProfile', () => {
  it('profil satırı olmayan kullanıcıda boş ama geçerli görünüm; şemaya uyar', async () => {
    const userId = await student();
    const profile = await content.getMyProfile(deps, userId);
    myProfileSchema.parse(profile);
    expect(profile).toMatchObject({
      userId,
      headline: null,
      education: [],
      skills: [],
      socialLinks: [],
      linkedinUrl: null,
      cvUpdatedAt: null,
      lastUpdatedAt: null,
    });
    expect(profile.completion.missing).toEqual(
      expect.arrayContaining(['BASICS', 'EDUCATION', 'SKILLS', 'CV']),
    );
    expect(profile.completion.percent).toBeLessThan(100);
  });

  it('doğrulanmamış (üyeliksiz) kullanıcı da kendi profilini görür; silinmiş/askıdaki göremez', async () => {
    const none = await createUser(db);
    await expect(content.getMyProfile(deps, none)).resolves.toBeDefined();
    await expectCode(
      content.getMyProfile(deps, await createUser(db, { banned: true })),
      'AUTH_ACCOUNT_SUSPENDED',
    );
    await expectCode(
      content.getMyProfile(deps, await createUser(db, { deletedAt: new Date() })),
      'AUTH_UNAUTHENTICATED',
    );
  });
});

describe('temel alanlar', () => {
  it('yazar, "son güncelleme" ilerler; boş metin temizler; elle yazılan alan korunur işaretlenir', async () => {
    const userId = await student();
    const t0 = new Date('2030-01-01T10:00:00Z');
    const first = await content.updateProfileBasics({ db, now: () => t0 }, userId, {
      headline: 'Veri Analisti Adayı',
      city: 'İstanbul',
    });
    expect(first).toMatchObject({
      headline: 'Veri Analisti Adayı',
      city: 'İstanbul',
      summary: null,
    });
    expect(first.lastUpdatedAt).toEqual(t0);
    const row = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect([...row.manualFields].sort()).toEqual(['city', 'headline']);
    const t1 = new Date(t0.getTime() + 60_000);
    const cleared = await content.updateProfileBasics({ db, now: () => t1 }, userId, {
      city: null,
      summary: 'Merhaba',
    });
    expect(cleared).toMatchObject({
      city: null,
      summary: 'Merhaba',
      headline: 'Veri Analisti Adayı',
    });
    expect(cleared.lastUpdatedAt).toEqual(t1);
    expect(
      [...(await db.profile.findUniqueOrThrow({ where: { userId } })).manualFields].sort(),
    ).toEqual(['headline', 'summary']);
  });
});

describe('bağlantılar', () => {
  it('kanonik biçimde saklanır, tür sırasıyla döner; boş liste temizler', async () => {
    const userId = await student();
    const saved = await content.setSocialLinks(deps, userId, {
      links: [
        { kind: 'X', url: 'https://x.com/ornek' },
        { kind: 'GITHUB', url: 'https://github.com/ornek' },
      ],
    });
    expect(saved.socialLinks).toEqual([
      { kind: 'GITHUB', url: 'https://github.com/ornek' },
      { kind: 'X', url: 'https://x.com/ornek' },
    ]);
    expect((await content.setSocialLinks(deps, userId, { links: [] })).socialLinks).toEqual([]);
  });

  it('servis Zod’u atlansa bile izinli olmayan adresi yazmaz', async () => {
    const userId = await student();
    for (const [kind, url, code] of [
      ['GITHUB', 'http://github.com/a', 'PROFILE_LINK_NOT_HTTPS'],
      ['GITHUB', 'https://evil.example/a', 'PROFILE_LINK_HOST_NOT_ALLOWED'],
      ['GITHUB', 'javascript:alert(1)', 'PROFILE_LINK_INVALID'],
    ] as const) {
      await expectCode(content.setSocialLinks(deps, userId, { links: [{ kind, url }] }), code);
    }
    await expectCode(
      content.setLinkedinUrl(deps, userId, { url: 'https://example.com/in/abc' }),
      'PROFILE_LINK_HOST_NOT_ALLOWED',
    );
    // Hata işlemi geri alır: profil satırı bile açılmaz.
    expect(await db.profile.findUnique({ where: { userId } })).toBeNull();
  });

  it('LinkedIn adresi kanonik yazılır ve kaldırılabilir', async () => {
    const userId = await student();
    expect(
      (
        await content.setLinkedinUrl(deps, userId, {
          url: 'https://tr.linkedin.com/in/ayse-ornek/',
        })
      ).linkedinUrl,
    ).toBe('https://www.linkedin.com/in/ayse-ornek');
    expect((await content.setLinkedinUrl(deps, userId, { url: null })).linkedinUrl).toBeNull();
  });
});

describe('kalemler', () => {
  const education = (institution = 'Örnek Üniversitesi') => ({
    section: 'EDUCATION' as const,
    values: {
      institution,
      level: 'BACHELOR' as const,
      fieldOfStudy: null,
      startDate: '2021-09',
      endDate: null,
      isCurrent: true,
    },
  });

  it('ekler (kaynak MANUAL, elle düzeltilmiş), günceller, siler; yalnız kendi kalemine dokunur', async () => {
    const userId = await student();
    const created = await content.saveProfileEntry(deps, userId, education());
    expect(created.education).toHaveLength(1);
    expect(created.education[0]).toMatchObject({
      source: 'MANUAL',
      manuallyEdited: true,
      institution: 'Örnek Üniversitesi',
    });
    const id = created.education[0]!.id;
    const updated = await content.saveProfileEntry(deps, userId, {
      ...education('Başka Üniversite'),
      id,
    });
    expect(updated.education.map((row) => row.institution)).toEqual(['Başka Üniversite']);

    const stranger = await student();
    await expectCode(
      content.saveProfileEntry(deps, stranger, { ...education('Hack'), id }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      content.deleteProfileEntry(deps, stranger, { section: 'EDUCATION', id }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      content.deleteProfileEntry(deps, userId, { section: 'POSITION', id }),
      'RESOURCE_NOT_FOUND',
    );
    expect((await content.getMyProfile(deps, userId)).education[0]?.institution).toBe(
      'Başka Üniversite',
    );

    expect(
      (await content.deleteProfileEntry(deps, userId, { section: 'EDUCATION', id })).education,
    ).toEqual([]);
  });

  it('CV kaynaklı kalemi düzenlemek onu "elle düzeltilmiş" yapar (yeni CV ezmez)', async () => {
    const userId = await student();
    const row = await db.language.create({
      data: { userId, name: 'Almanca', normalizedName: 'almanca', level: 'A2', source: 'CV' },
    });
    const result = await content.saveProfileEntry(deps, userId, {
      section: 'LANGUAGE',
      id: row.id,
      values: { name: 'Almanca', level: 'B1' },
    });
    expect(result.languages[0]).toMatchObject({ level: 'B1', source: 'CV', manuallyEdited: true });
  });

  it('bölüm başına üst sınır ve aynı dilin ikinci kez eklenmesi', async () => {
    const userId = await student();
    for (let index = 0; index < 10; index += 1) {
      await content.saveProfileEntry(deps, userId, education(`Okul ${index}`));
    }
    await expectCode(
      content.saveProfileEntry(deps, userId, education('Fazla')),
      'PROFILE_LIMIT_REACHED',
    );
    await content.saveProfileEntry(deps, userId, {
      section: 'LANGUAGE',
      values: { name: 'İngilizce', level: 'B2' },
    });
    await expectCode(
      content.saveProfileEntry(deps, userId, {
        section: 'LANGUAGE',
        values: { name: 'ingilizce', level: 'C1' },
      }),
      'RESOURCE_CONFLICT',
    );
    expect((await content.getMyProfile(deps, userId)).languages).toHaveLength(1);
  });

  it('pozisyon: sözlükle eşleşen şirket bağlanır, eşleşmeyen yönetici kuyruğuna düşer; sertifika tarihi', async () => {
    const userId = await student();
    const name = `Şirket${tag()}`;
    const company = await db.company.create({
      data: { name, normalizedName: name.toLowerCase().replace('ş', 's'), aliases: [] },
    });
    const unknown = `Bilinmez${tag()}`;
    await content.saveProfileEntry(deps, userId, {
      section: 'POSITION',
      values: {
        company: name,
        title: 'Stajyer',
        employmentType: 'INTERNSHIP',
        startDate: '2024-07',
        endDate: '2024-09',
        isCurrent: false,
        description: null,
      },
    });
    await content.saveProfileEntry(deps, userId, {
      section: 'POSITION',
      values: {
        company: unknown,
        title: 'Stajyer',
        employmentType: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        description: null,
      },
    });
    const rows = await db.position.findMany({ where: { userId }, orderBy: { companyRaw: 'asc' } });
    expect(rows.find((row) => row.companyRaw === name)?.companyId).toBe(company.id);
    expect(rows.find((row) => row.companyRaw === unknown)?.companyId).toBeNull();
    expect(await db.unmatchedValue.count({ where: { kind: 'COMPANY', rawValue: unknown } })).toBe(
      1,
    );
    const cert = await content.saveProfileEntry(deps, userId, {
      section: 'CERTIFICATION',
      values: { name: 'Sertifika', issuer: null, issuedDate: '2024-05' },
    });
    expect(cert.certifications[0]?.issuedDate).toBe('2024-05');
  });
});

// =============================================================================================
// Beceriler (Tag SKILL + kullanıcı-etiket bağı)
// =============================================================================================
describe('beceriler', () => {
  it('serbest metin beceri kişisel etikete dönüşür, yönetici kuyruğuna düşer; aynı beceri (harf/Türkçe farkı) tekrar eklenmez', async () => {
    const userId = await student();
    const name = `Özel Beceri ${tag()}`;
    const first = await content.addProfileSkill(deps, userId, { name });
    expect(first.skills.map((skill) => skill.label)).toEqual([name]);
    const row = await db.tag.findFirstOrThrow({ where: { kind: 'SKILL', label: name } });
    expect(row).toMatchObject({ curated: false });
    expect(await db.unmatchedValue.count({ where: { kind: 'SKILL', rawValue: name } })).toBe(1);
    await content.addProfileSkill(deps, userId, { name: name.toUpperCase() });
    await content.addProfileSkill(deps, userId, { name: ` ${name} ` });
    expect((await content.getMyProfile(deps, userId)).skills).toHaveLength(1);
    expect(await db.unmatchedValue.count({ where: { kind: 'SKILL', rawValue: name } })).toBe(1);
  });

  it('sözlükle eşleşen beceri kurallı (curated) etiket ve kurallı adla gelir', async () => {
    const userId = await student();
    const canonical = `TypeScript${tag()}`;
    await db.skill.create({
      data: {
        name: canonical,
        normalizedName: canonical.toLowerCase(),
        aliases: [`ts${canonical.toLowerCase()}`],
      },
    });
    const result = await content.addProfileSkill(deps, userId, {
      name: `ts${canonical.toLowerCase()}`,
    });
    expect(result.skills.map((skill) => skill.label)).toEqual([canonical]);
    expect(
      await db.tag.findFirstOrThrow({ where: { kind: 'SKILL', label: canonical } }),
    ).toMatchObject({ curated: true });
  });

  it('kaldırma: yalnız kendi bağını siler; başkasının etiket kimliği NOT_FOUND; yetim kişisel etiket silinir, kurallı kalır', async () => {
    const a = await student();
    const b = await student();
    const personal = `Kişisel ${tag()}`;
    const mine = (await content.addProfileSkill(deps, a, { name: personal })).skills[0]!;
    const theirs = (await content.addProfileSkill(deps, b, { name: `Baska ${tag()}` })).skills[0]!;
    await expectCode(
      content.removeProfileSkill(deps, a, { tagId: theirs.tagId }),
      'RESOURCE_NOT_FOUND',
    );
    expect((await content.getMyProfile(deps, b)).skills).toHaveLength(1);
    expect((await content.removeProfileSkill(deps, a, { tagId: mine.tagId })).skills).toEqual([]);
    expect(await db.tag.count({ where: { id: mine.tagId } })).toBe(0);

    const canonical = `Kurallı${tag()}`;
    await db.skill.create({
      data: {
        name: canonical,
        normalizedName: canonical.toLowerCase().replace('ı', 'i'),
        aliases: [],
      },
    });
    const curated = (await content.addProfileSkill(deps, a, { name: canonical })).skills[0]!;
    await content.removeProfileSkill(deps, a, { tagId: curated.tagId });
    expect(await db.tag.count({ where: { id: curated.tagId } })).toBe(1);
  });

  it('üst sınır (60) ve eşzamanlı aynı beceri tek bağ üretir', async () => {
    const userId = await student();
    const profile = await db.profile.create({ data: { userId } });
    const tags = await Promise.all(
      Array.from({ length: 60 }, async (_, index) =>
        db.tag.create({
          data: {
            kind: 'SKILL',
            slug: `limit-${tag()}-${index}`,
            label: `Limit ${index}`,
            curated: false,
          },
        }),
      ),
    );
    await db.profileTag.createMany({
      data: tags.map((row) => ({ profileId: profile.id, tagId: row.id })),
    });
    await expectCode(
      content.addProfileSkill(deps, userId, { name: 'Yeni Beceri' }),
      'PROFILE_LIMIT_REACHED',
    );

    const racer = await student();
    const name = `Yarış ${tag()}`;
    await Promise.all(
      Array.from({ length: 5 }, () => content.addProfileSkill(deps, racer, { name })),
    );
    expect((await content.getMyProfile(deps, racer)).skills).toHaveLength(1);
  });

  it('öneri: yalnız kurallı adlar; başkasının serbest yazdığı beceri ASLA önerilmez', async () => {
    const canary = `GizliBeceri${tag()}`;
    const owner = await student();
    await content.addProfileSkill(deps, owner, { name: canary });
    const curated = `Pyth${tag()}`;
    await db.skill.create({
      data: { name: curated, normalizedName: curated.toLowerCase(), aliases: [] },
    });
    const asker = await student();
    const found = await content.suggestSkills(deps, asker, { query: curated.slice(0, 6) });
    expect(found.skills.map((skill) => skill.label)).toContain(curated);
    const leak = await content.suggestSkills(deps, asker, { query: canary.slice(0, 8) });
    expect(JSON.stringify(leak)).not.toContain(canary);
    expect(leak.skills).toEqual([]);
  });
});

describe('tamamlama göstergesi', () => {
  it('içerik adımları tamamlandıkça yüzde artar; CV adımı CV uygulanınca dolar', async () => {
    const userId = await student();
    const before = await content.getMyProfile(deps, userId);
    await content.updateProfileBasics(deps, userId, { headline: 'Başlık', city: 'Ankara' });
    await content.saveProfileEntry(deps, userId, {
      section: 'EDUCATION',
      values: {
        institution: 'Ü',
        level: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
      },
    });
    for (const name of ['Bir', 'İki', 'Üç'])
      await content.addProfileSkill(deps, userId, { name: `${name}${tag()}` });
    const after = await content.getMyProfile(deps, userId);
    expect(after.completion.percent).toBeGreaterThan(before.completion.percent);
    expect(after.completion.missing).not.toEqual(expect.arrayContaining(['BASICS']));
    expect(after.completion.missing).not.toEqual(expect.arrayContaining(['EDUCATION']));
    expect(after.completion.missing).not.toEqual(expect.arrayContaining(['SKILLS']));
    expect(after.completion.missing).toContain('CV');
    await db.profile.update({ where: { userId }, data: { cvUpdatedAt: new Date() } });
    expect((await content.getMyProfile(deps, userId)).completion.missing).not.toContain('CV');
  });
});

describe('yetkisiz yazma', () => {
  it('askıdaki ve silinmiş hesap hiçbir şey yazamaz', async () => {
    const suspended = await createUser(db, { banned: true });
    const deleted = await createUser(db, { deletedAt: new Date() });
    for (const [userId, code] of [
      [suspended, 'AUTH_ACCOUNT_SUSPENDED'],
      [deleted, 'AUTH_UNAUTHENTICATED'],
    ] as const) {
      await expectCode(content.updateProfileBasics(deps, userId, { headline: 'x' }), code);
      await expectCode(content.addProfileSkill(deps, userId, { name: 'Python' }), code);
      await expectCode(
        content.saveProfileEntry(deps, userId, {
          section: 'LANGUAGE',
          values: { name: 'x', level: null },
        }),
        code,
      );
      expect(await db.profile.findUnique({ where: { userId } })).toBeNull();
    }
  });
});

// =============================================================================================
// Başkasının profili: görünürlük sunucuda süzülür
// =============================================================================================
describe('getProfile — görünürlük süzgeci (sızıntı testi)', () => {
  type Level = 'PRIVATE' | 'ON_APPROVED_REQUEST' | 'MEMBERS';
  const FIELDS = ['EMAIL', 'PHONE', 'SOCIAL_LINKS', 'LINKEDIN'] as const;

  /** Her koşuda yeni rastgele işaretlerle dolu hedef: gizli alan yanıtta bulunursa metin taramasıyla yakalanır. */
  async function seededTarget(levels: Partial<Record<(typeof FIELDS)[number], Level>>) {
    const canary = {
      email: `${tag()}@ornek.test`,
      phone: `0532${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      github: tag(),
      linkedin: `ln${tag()}`,
    };
    const userId = await createUser(db, { email: canary.email });
    await db.user.update({ where: { id: userId }, data: { phone: canary.phone } });
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await content.setSocialLinks(deps, userId, {
      links: [{ kind: 'GITHUB', url: `https://github.com/${canary.github}` }],
    });
    await content.setLinkedinUrl(deps, userId, {
      url: `https://www.linkedin.com/in/${canary.linkedin}`,
    });
    await content.updateProfileBasics(deps, userId, {
      headline: 'Herkese açık başlık',
      city: 'İstanbul',
    });
    for (const [field, level] of Object.entries(levels)) {
      await db.fieldVisibility.create({
        data: { userId, field: field as (typeof FIELDS)[number], level: level as Level },
      });
    }
    return { userId, canary };
  }
  const approve = (requesterId: string, targetId: string, fields: (typeof FIELDS)[number][]) =>
    db.contactRequest.create({
      data: { requesterId, targetId, fields, status: 'APPROVED', decidedAt: new Date() },
    });

  // beklenen: [seviye, bakan] → alanın görünüp görünmediği (docs/security.md KVKK görünürlük seviyeleri)
  const CASES: [Level, 'owner' | 'member' | 'approved', boolean][] = [
    ['PRIVATE', 'owner', true],
    ['PRIVATE', 'member', false],
    ['PRIVATE', 'approved', false],
    ['ON_APPROVED_REQUEST', 'owner', true],
    ['ON_APPROVED_REQUEST', 'member', false],
    ['ON_APPROVED_REQUEST', 'approved', true],
    ['MEMBERS', 'owner', true],
    ['MEMBERS', 'member', true],
    ['MEMBERS', 'approved', true],
  ];

  it.each(CASES)(
    '%s · %s bakan → görünür: %s (dört alan için)',
    async (level, viewerKind, visible) => {
      const { userId, canary } = await seededTarget({
        EMAIL: level,
        PHONE: level,
        SOCIAL_LINKS: level,
        LINKEDIN: level,
      });
      const viewerId = viewerKind === 'owner' ? userId : await student();
      if (viewerKind === 'approved') await approve(viewerId, userId, [...FIELDS]);
      const view = await content.getProfile(deps, viewerId, userId);
      profileViewSchema.parse(view);
      const text = JSON.stringify(view);
      const expectations: [string, string, boolean][] = [
        ['email', canary.email, 'email' in view],
        ['phone', canary.phone, 'phone' in view],
        ['socialLinks', canary.github, 'socialLinks' in view],
        ['linkedinUrl', canary.linkedin, 'linkedinUrl' in view],
      ];
      for (const [name, value, present] of expectations) {
        expect(present, `${name} anahtarı`).toBe(visible);
        expect(text.includes(value), `${name} değeri`).toBe(visible);
      }
      // Her durumda görünür temel içerik
      expect(view).toMatchObject({ headline: 'Herkese açık başlık', city: 'İstanbul' });
    },
  );

  it('varsayılanlar: e-posta/telefon yalnız onaylı talebe, sosyal/LinkedIn doğrulanmış üyelere açık', async () => {
    const { userId, canary } = await seededTarget({});
    const view = await content.getProfile(deps, await student(), userId);
    expect('email' in view || 'phone' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain(canary.email);
    expect(JSON.stringify(view)).not.toContain(canary.phone);
    expect(view.socialLinks?.[0]?.url).toContain(canary.github);
    expect(view.linkedinUrl).toContain(canary.linkedin);
  });

  it('onaylı talep yalnız İSTENEN alanı açar; başka alan kapalı kalır', async () => {
    const { userId, canary } = await seededTarget({
      EMAIL: 'ON_APPROVED_REQUEST',
      PHONE: 'ON_APPROVED_REQUEST',
    });
    const viewerId = await student();
    await approve(viewerId, userId, ['EMAIL']);
    const view = await content.getProfile(deps, viewerId, userId);
    expect(view.email).toBe(canary.email);
    expect('phone' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain(canary.phone);
  });

  it('geri alınan/bekleyen talep alanı açmaz', async () => {
    const { userId, canary } = await seededTarget({ EMAIL: 'ON_APPROVED_REQUEST' });
    for (const status of ['PENDING', 'REVOKED', 'REJECTED', 'WITHDRAWN'] as const) {
      const viewerId = await student();
      const stamps = {
        decidedAt: status === 'PENDING' || status === 'WITHDRAWN' ? null : new Date(),
        closedAt: status === 'REVOKED' || status === 'WITHDRAWN' ? new Date() : null,
      };
      await db.contactRequest.create({
        data: { requesterId: viewerId, targetId: userId, fields: ['EMAIL'], status, ...stamps },
      });
      const view = await content.getProfile(deps, viewerId, userId);
      expect(JSON.stringify(view), status).not.toContain(canary.email);
    }
  });

  it('görünüm kimlik, kaynak, düzeltme, etiket kimliği ve tamamlama bilgisi taşımaz', async () => {
    const { userId } = await seededTarget({});
    await content.saveProfileEntry(deps, userId, {
      section: 'LANGUAGE',
      values: { name: 'İngilizce', level: 'B2' },
    });
    await content.addProfileSkill(deps, userId, { name: `Beceri ${tag()}` });
    const view = await content.getProfile(deps, await student(), userId);
    const text = JSON.stringify(view);
    for (const forbidden of [
      'manuallyEdited',
      'source',
      'completion',
      'tagId',
      'cvUpdatedAt',
      'onboarding',
      'manualFields',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(view.languages).toEqual([{ name: 'İngilizce', level: 'B2' }]);
    expect(view.skills).toHaveLength(1);
    expect(Object.keys(view.skills[0]!)).toEqual(['label']);
  });

  it('bozulmuş saklı bağlantı yayılmaz (izinli alan adı dışı süzülür)', async () => {
    const { userId } = await seededTarget({});
    await db.profile.update({
      where: { userId },
      data: {
        socialLinks: [
          { kind: 'GITHUB', url: 'https://github.com/iyi' },
          { kind: 'GITHUB', url: 'javascript:alert(1)' },
          { kind: 'X', url: 'https://evil.example/x' },
          { kind: 'ROKET', url: 'https://github.com/x' },
          'metin',
        ],
        linkedinUrl: 'https://evil.example/in/abc',
      },
    });
    const view = await content.getProfile(deps, await student(), userId);
    expect(view.socialLinks).toEqual([{ kind: 'GITHUB', url: 'https://github.com/iyi' }]);
    expect('linkedinUrl' in view).toBe(false);
  });

  describe('hedef görünür değilse varlığı sızmaz (RESOURCE_NOT_FOUND)', () => {
    const cases: [string, () => Promise<string>][] = [
      ['silinmiş hesap', async () => student(inst, { deletedAt: new Date() })],
      ['askıdaki hesap', async () => student(inst, { banned: true })],
      [
        'süresiz askı + süreli askı',
        async () => student(inst, { banned: true, banExpires: new Date(Date.now() + 86_400_000) }),
      ],
      ['başka üniversite', async () => student(other)],
      [
        'doğrulanmamış üye',
        async () => {
          const userId = await createUser(db);
          await addMembership(db, {
            userId,
            departmentId: inst.deptA1,
            role: 'ALUMNI',
            status: 'PENDING',
            graduationYear: 2023,
          });
          return userId;
        },
      ],
      ['üyeliksiz kullanıcı', async () => createUser(db)],
      [
        'kapanmış üyelik',
        async () => {
          const userId = await createUser(db);
          await addMembership(db, {
            userId,
            departmentId: inst.deptA1,
            role: 'STUDENT',
            entryYear: 2020,
            endedAt: new Date('2024-01-01'),
          });
          return userId;
        },
      ],
    ];
    it.each(cases)('%s', async (_name, make) => {
      const userId = await make();
      await db.profile.upsert({
        where: { userId },
        create: { userId, headline: `GizliBaşlık${tag()}` },
        update: {},
      });
      const error = await content.getProfile(deps, await student(), userId).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(isCodedError(error) && error.code).toBe('RESOURCE_NOT_FOUND');
      expect(JSON.stringify(error)).not.toContain('GizliBaşlık');
    });

    it('var olmayan kullanıcı aynı yanıtı alır', async () => {
      await expectCode(
        content.getProfile(deps, await student(), randomUUID()),
        'RESOURCE_NOT_FOUND',
      );
    });
  });

  it('bakan doğrulanmamışsa ya da askıdaysa profil göremez', async () => {
    const { userId } = await seededTarget({});
    await expectCode(content.getProfile(deps, await createUser(db), userId), 'AUTH_NOT_VERIFIED');
    await expectCode(
      content.getProfile(deps, await student(inst, { banned: true }), userId),
      'AUTH_ACCOUNT_SUSPENDED',
    );
  });

  it('aynı üniversitenin başka bölümündeki doğrulanmış üye görebilir; kendi profili sahip görünümüdür', async () => {
    const { userId } = await seededTarget({ EMAIL: 'PRIVATE' });
    const otherDepartment = await createUser(db);
    await addMembership(db, {
      userId: otherDepartment,
      departmentId: inst.deptB1,
      role: 'ACADEMIC',
    });
    await expect(content.getProfile(deps, otherDepartment, userId)).resolves.toBeDefined();
    const own = await content.getProfile(deps, userId, userId);
    expect('email' in own).toBe(true);
  });
});
