import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { applyCvSchema, parsedCvSchema } from '@/contracts/cv';
import { cvKit, cvUser, pdfForm, skillCount } from '@/test/cv';
import { createTestPrisma } from '@/test/db';
import { createFakeLlm, LlmError } from '../external/llm';
import { withCvTextRedaction } from '../external/pdf-text';
import { applyCv, discardCv, getCvReview, uploadCv } from './cv';
import { processCvParse } from './cv-parse';
import { normalizeName } from '../rules/dictionary';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const FRESH = { retryCount: 0, retryLimit: 2 };
async function parsed(raw: unknown) {
  const user = await cvUser(db);
  const kit = cvKit(db, { llm: createFakeLlm({ scenarios: { reviewer: () => raw } }) });
  const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'reviewer' }));
  await processCvParse(kit.deps, upload.cvUploadId, FRESH);
  return { ...user, kit, id: upload.cvUploadId };
}
it.each(['EDUCATION', 'LANGUAGE', 'CERTIFICATION'] as const)(
  'onayda mevcut %s adını düzeltme gerçekten kaydedilir',
  async (section) => {
    const raw =
      section === 'EDUCATION'
        ? { education: [{ institution: 'Eski Okul', level: 'BACHELOR', fieldOfStudy: 'YBS' }] }
        : section === 'LANGUAGE'
          ? { languages: [{ name: 'İngilizce', level: 'C1' }] }
          : { certifications: [{ name: 'Eski Sertifika', issuer: 'Yeni Kurum' }] };
    const u = await parsed(raw);
    if (section === 'EDUCATION')
      await db.education.create({
        data: {
          userId: u.userId,
          institution: 'Eski Okul',
          level: 'BACHELOR',
          fieldOfStudy: 'Eski Bölüm',
          source: 'CV',
        },
      });
    if (section === 'LANGUAGE')
      await db.language.create({
        data: {
          userId: u.userId,
          name: 'İngilizce',
          normalizedName: 'ingilizce',
          level: 'B1',
          source: 'CV',
        },
      });
    if (section === 'CERTIFICATION')
      await db.certification.create({
        data: { userId: u.userId, name: 'Eski Sertifika', issuer: 'Eski Kurum', source: 'CV' },
      });
    const review = await getCvReview(u.kit.deps, u.actor, u.id);
    const item = review.items[0]!;
    const corrected =
      section === 'EDUCATION'
        ? { ...item.proposed, institution: 'Düzeltilmiş Okul' }
        : { ...item.proposed, name: 'Düzeltilmiş Ad' };
    await applyCv(
      u.kit.deps,
      u.actor,
      applyCvSchema.parse({
        cvUploadId: u.id,
        decisions: [{ key: item.key, section, values: corrected }],
      }),
    );
    if (section === 'EDUCATION')
      expect(await db.education.findFirstOrThrow({ where: { userId: u.userId } })).toMatchObject({
        institution: 'Düzeltilmiş Okul',
        manuallyEdited: true,
      });
    if (section === 'LANGUAGE')
      expect(await db.language.findFirstOrThrow({ where: { userId: u.userId } })).toMatchObject({
        name: 'Düzeltilmiş Ad',
        normalizedName: normalizeName('Düzeltilmiş Ad'),
        manuallyEdited: true,
      });
    if (section === 'CERTIFICATION')
      expect(
        await db.certification.findFirstOrThrow({ where: { userId: u.userId } }),
      ).toMatchObject({ name: 'Düzeltilmiş Ad', manuallyEdited: true });
  },
);
it.each(['upload', 'apply', 'discard'] as const)(
  'oturumdan sonra askıya alınmış hesap %s yapamaz (bayat Actor)',
  async (operation) => {
    const u = await parsed({ skills: ['SQL'] });
    const review = await getCvReview(u.kit.deps, u.actor, u.id);
    await db.user.update({ where: { id: u.userId }, data: { banned: true } });
    const call =
      operation === 'upload'
        ? () => uploadCv(u.kit.deps, u.actor, pdfForm())
        : operation === 'discard'
          ? () => discardCv(u.kit.deps, u.actor, u.id)
          : () =>
              applyCv(
                u.kit.deps,
                u.actor,
                applyCvSchema.parse({
                  cvUploadId: u.id,
                  decisions: [{ section: 'SKILL', key: review.items[0]!.key }],
                }),
              );
    await expect(call()).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_SUSPENDED' });
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('PARSED');
    expect(await skillCount(db, u.userId)).toBe(0);
  },
);
it('eski ayrıştırma denemesinin geç hatası yeni PARSED sonucunun dosyasını silemez', async () => {
  const user = await cvUser(db);
  const started = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  let calls = 0;
  const kit = cvKit(db, {
    llm: {
      provider: 'reviewer',
      async parseCv() {
        throw new Error('Ham PDF gerçek sağlayıcıya gönderilemez');
      },
      async parseRedactedCv() {
        calls++;
        if (calls === 1) {
          started.resolve();
          await finish.promise;
          throw new LlmError('REJECTED');
        }
        return { skills: ['SQL'] };
      },
    },
    pdfTextExtractor: withCvTextRedaction({ kind: 'real', extract: async () => 'SQL' }),
  });
  const upload = await uploadCv(kit.deps, user.actor, pdfForm());
  const first = processCvParse(kit.deps, upload.cvUploadId, { retryCount: 0, retryLimit: 0 });
  await started.promise;
  try {
    expect(
      await processCvParse(kit.deps, upload.cvUploadId, { retryCount: 1, retryLimit: 2 }),
    ).toBe('PARSED');
  } finally {
    finish.resolve();
    await first;
  }
  const row = await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } });
  expect(row.status).toBe('PARSED');
  expect(row.parsedJson).toMatchObject({ skills: ['SQL'] });
  expect(await kit.storage.get(row.storageKey!)).not.toBeNull();
});
it('bağımsız düşmanca CV: rol/yetki sızmaz, onaysız yazmaz; logda girdi/çıktı yok', async () => {
  const victim = await cvUser(db);
  const secret = `private-${randomUUID()}`;
  const raw = {
    skills: ['SQL', secret],
    positions: [
      { company: 'Sahte Şirket', title: 'Stajyer', role: 'admin', userId: victim.userId },
    ],
    role: 'admin',
    userId: victim.userId,
    adminGrants: [{ scope: 'SYSTEM' }],
    memberships: [{ role: 'ACADEMIC', verificationStatus: 'VERIFIED' }],
  };
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    const u = await parsed(raw);
    const row = await db.cvUpload.findUniqueOrThrow({ where: { id: u.id } });
    expect(JSON.stringify(row.parsedJson)).not.toContain(victim.userId);
    expect(parsedCvSchema.safeParse(row.parsedJson).success).toBe(true);
    expect(await skillCount(db, u.userId)).toBe(0);
    expect(await db.position.count({ where: { userId: u.userId } })).toBe(0);
    const review = await getCvReview(u.kit.deps, u.actor, u.id);
    const skill = review.items.find(
      (item) => item.section === 'SKILL' && item.proposed.name === 'SQL',
    )!;
    const before = await db.user.findMany({
      select: { id: true, role: true, email: true, banned: true },
      orderBy: { id: 'asc' },
    });
    const grants = await db.adminGrant.count(),
      memberships = await db.membership.count();
    await applyCv(
      u.kit.deps,
      u.actor,
      applyCvSchema.parse({ cvUploadId: u.id, decisions: [{ key: skill.key, section: 'SKILL' }] }),
    );
    expect(await skillCount(db, u.userId)).toBe(1);
    expect(await db.position.count({ where: { userId: u.userId } })).toBe(0);
    expect(await db.adminGrant.count()).toBe(grants);
    expect(await db.membership.count()).toBe(memberships);
    expect(
      await db.user.findMany({
        select: { id: true, role: true, email: true, banned: true },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    const logged = [...stderr.mock.calls, ...stdout.mock.calls]
      .map((call) => String(call[0]))
      .join('');
    for (const value of [secret, victim.userId, '%PDF-', 'Sahte Şirket'])
      expect(logged).not.toContain(value);
  } finally {
    stderr.mockRestore();
    stdout.mockRestore();
  }
});

it('LLM çıktı sınırı karakter değil UTF-8 baytıdır', async () => {
  const raw = {
    positions: Array.from({ length: 30 }, (_, i) => ({
      company: `Kurum ${i}`,
      title: 'Uzman',
      description: '漢'.repeat(1000),
    })),
  };
  const checked = parsedCvSchema.parse(raw);
  expect(JSON.stringify(checked).length).toBeLessThan(65536);
  expect(Buffer.byteLength(JSON.stringify(checked), 'utf8')).toBeGreaterThan(65536);
  const user = await cvUser(db),
    kit = cvKit(db, { llm: createFakeLlm({ scenarios: { reviewer: () => raw } }) });
  const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'reviewer' }));
  expect(await processCvParse(kit.deps, upload.cvUploadId, { retryCount: 0, retryLimit: 0 })).toBe(
    'FAILED',
  );
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } })).toMatchObject({
    errorCode: 'CV_PARSE_INVALID_OUTPUT',
    parsedJson: null,
  });
});
