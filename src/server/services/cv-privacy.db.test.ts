import { afterAll, describe, expect, it } from 'vitest';

import { dataExportSchema } from '@/contracts/privacy';
import { applyCvSchema, type CvDecisionInput } from '@/contracts/cv';
import { cvKit, cvUser, pdfForm, skillCount } from '@/test/cv';
import { createTestPrisma } from '@/test/db';

import { deleteAccount } from './accountDeletion';
import { applyCv, getCvReview, uploadCv } from './cv';
import { processCvParse } from './cv-parse';
import { buildDataExport } from './dataExport';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const FRESH = { retryCount: 0, retryLimit: 2 };

/** Profili CV ile dolmuş kullanıcı: uygulanmış bir CV + onay bekleyen ikinci CV. */
async function userWithCv(
  scenarios: { applied: string; pending: string } = {
    applied: 'ornek-ayse',
    pending: 'ornek-can-linkedin',
  },
) {
  const user = await cvUser(db);
  const kit = cvKit(db);
  const first = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: scenarios.applied }));
  await processCvParse(kit.deps, first.cvUploadId, FRESH);
  const review = await getCvReview(kit.deps, user.actor, first.cvUploadId);
  await applyCv(
    kit.deps,
    user.actor,
    applyCvSchema.parse({
      cvUploadId: first.cvUploadId,
      decisions: review.items.map((item) => ({
        key: item.key,
        section: item.section,
      })) as CvDecisionInput[],
    }),
  );
  const second = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: scenarios.pending }));
  await processCvParse(kit.deps, second.cvUploadId, FRESH);
  return { ...user, kit, first: first.cvUploadId, second: second.cvUploadId };
}

const emailOf = async (userId: string) =>
  (await db.user.findUniqueOrThrow({ where: { id: userId } })).email;

describe('veri dökümü (KVKK m. 11)', () => {
  it('kullanıcının kendi CV ve profil kalemlerini içerir; dosya anahtarı ve başkasının verisi YOK; şemaya uyar', async () => {
    const mine = await userWithCv();
    const other = await userWithCv({ applied: 'ornek-elif-mezun', pending: 'ornek-mert-tarama' });
    const exported = await buildDataExport(db, mine.userId);
    dataExportSchema.parse(exported);
    expect(exported.cv.uploads).toHaveLength(2);
    expect(exported.cv.uploads.map((upload) => upload.status)).toEqual(['APPLIED', 'PARSED']);
    expect(exported.cv.uploads[1]?.pendingParsedCv).toMatchObject({ positions: expect.any(Array) });
    expect(exported.cv.positions.map((row) => row.company)).toEqual([
      'Deneme Yazılım A.Ş.',
      'Kurgu Teknoloji Ltd. Şti.',
    ]);
    expect(exported.cv.skills).toHaveLength(5);
    expect(exported.cv.experienceInvitations).toHaveLength(2);
    const text = JSON.stringify(exported);
    expect(text).not.toMatch(/storageKey|cv\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf/);
    expect(text).not.toContain(other.userId);
    expect(text).not.toContain('Elif');
    expect(text).not.toContain('"companyId"');
  });

  it('CV’si olmayan kullanıcının dökümünde cv bölümü boştur ama vardır', async () => {
    const user = await cvUser(db);
    const exported = await buildDataExport(db, user.userId);
    expect(exported.cv).toEqual({
      uploads: [],
      education: [],
      positions: [],
      languages: [],
      certifications: [],
      skills: [],
      experienceInvitations: [],
    });
  });
});

describe('hesap silme', () => {
  it('CV yüklemeleri, ayrıştırma çıktısı, profil kalemleri ve davetler silinir; dosyalar depodan gider; başkasına dokunulmaz', async () => {
    const mine = await userWithCv();
    const other = await userWithCv({ applied: 'ornek-elif-mezun', pending: 'ornek-mert-tarama' });
    const keys = (
      await db.cvUpload.findMany({ where: { userId: mine.userId }, select: { storageKey: true } })
    ).map((row) => row.storageKey!);
    expect(keys).toHaveLength(2);
    const removed: string[] = [];
    await deleteAccount(
      db,
      mine.userId,
      { publishedContent: 'DELETE', confirmEmail: await emailOf(mine.userId) },
      {
        removeStoredFiles: async (list) => {
          for (const key of list) {
            removed.push(key);
            await mine.kit.storage.delete(key);
          }
        },
      },
    );
    expect(removed.sort()).toEqual([...keys].sort());
    for (const key of keys) expect(mine.kit.storage.files.has(key)).toBe(false);
    const gone = await Promise.all([
      db.cvUpload.count({ where: { userId: mine.userId } }),
      db.education.count({ where: { userId: mine.userId } }),
      db.position.count({ where: { userId: mine.userId } }),
      db.language.count({ where: { userId: mine.userId } }),
      db.certification.count({ where: { userId: mine.userId } }),
      skillCount(db, mine.userId),
      db.experienceInvitation.count({ where: { userId: mine.userId } }),
    ]);
    expect(gone).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // Başka kullanıcı etkilenmez.
    expect(await db.cvUpload.count({ where: { userId: other.userId } })).toBe(2);
    expect(await db.position.count({ where: { userId: other.userId } })).toBeGreaterThan(0);
  });

  it('silinecek CV dosyası varken dosya silme bağlı değilse işlem HİÇ başlamaz (yarım silme yok)', async () => {
    const mine = await userWithCv();
    await expect(
      deleteAccount(
        db,
        mine.userId,
        { publishedContent: 'DELETE', confirmEmail: await emailOf(mine.userId) },
        { removeStoredFiles: null },
      ),
    ).rejects.toThrow();
    expect(await db.cvUpload.count({ where: { userId: mine.userId } })).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: mine.userId } })).deletedAt).toBeNull();
  });

  it('dosya silme başarısızsa hesap ve CV kayıtları korunur (yeniden denenebilir)', async () => {
    const mine = await userWithCv();
    await expect(
      deleteAccount(
        db,
        mine.userId,
        { publishedContent: 'DELETE', confirmEmail: await emailOf(mine.userId) },
        {
          removeStoredFiles: async () => {
            throw new Error('depolama kapalı');
          },
        },
      ),
    ).rejects.toThrow();
    expect(await db.cvUpload.count({ where: { userId: mine.userId } })).toBe(2);
    expect(await db.position.count({ where: { userId: mine.userId } })).toBeGreaterThan(0);
  });

  it('silinen hesabın işlenmekte olan CV işi satır bulamaz ve atlanır: LLM’e hiçbir şey gitmez', async () => {
    const user = await cvUser(db);
    const kit = cvKit(db);
    const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'ornek-ayse' }));
    await deleteAccount(
      db,
      user.userId,
      { publishedContent: 'DELETE', confirmEmail: await emailOf(user.userId) },
      {
        removeStoredFiles: async (list) => {
          for (const key of list) await kit.storage.delete(key);
        },
      },
    );
    expect(await processCvParse(kit.deps, upload.cvUploadId, FRESH)).toBe('SKIPPED');
    expect(kit.llm.calls).toBe(0);
    expect(kit.storage.files.size).toBe(0);
    expect(await db.education.count({ where: { userId: user.userId } })).toBe(0);
  });
});
