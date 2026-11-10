import { afterAll, expect, it } from 'vitest';
import { applyCvSchema } from '@/contracts/cv';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { applyCv, discardCv, getCvReview, uploadCv } from './cv';
import { processCvParse, purgeCvFiles } from './cv-parse';
import { buildDataExport } from './dataExport';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const fresh = { retryCount: 0, retryLimit: 2 };
it('LinkedIn önerileri açık seçim öncesi yazılmaz, karar dosyayı siler ve eski CV korunur', async () => {
  const { userId, actor } = await cvUser(db);
  const kit = cvKit(db);
  const previous = await uploadCv(kit.deps, actor, pdfForm());
  await processCvParse(kit.deps, previous.cvUploadId, fresh);
  const priorReview = await getCvReview(kit.deps, actor, previous.cvUploadId);
  const priorItem = priorReview.items[0]!;
  await applyCv(
    kit.deps,
    actor,
    applyCvSchema.parse({
      cvUploadId: previous.cvUploadId,
      decisions: [{ key: priorItem.key, section: priorItem.section }],
    }),
  );
  const prior = await db.cvUpload.findUniqueOrThrow({ where: { id: previous.cvUploadId } });
  expect(prior.storageKey).not.toBeNull();
  const linked = await uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  await processCvParse(kit.deps, linked.cvUploadId, fresh);
  expect(
    (await buildDataExport(db, userId)).cv.uploads.find((row) => row.id === linked.cvUploadId)
      ?.source,
  ).toBe('LINKEDIN_PDF');
  const before = await db.position.count({ where: { userId } });
  const review = await getCvReview(kit.deps, actor, linked.cvUploadId);
  expect(await db.position.count({ where: { userId } })).toBe(before);
  const item = review.items[0]!;
  expect(item).toBeDefined();
  await applyCv(
    kit.deps,
    actor,
    applyCvSchema.parse({
      cvUploadId: linked.cvUploadId,
      decisions: [{ key: item.key, section: item.section }],
    }),
  );
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: linked.cvUploadId } })).toMatchObject({
    source: 'LINKEDIN_PDF',
    status: 'APPLIED',
    storageKey: null,
  });
  expect((await db.cvUpload.findUniqueOrThrow({ where: { id: prior.id } })).storageKey).toBe(
    prior.storageKey,
  );
  expect(kit.storage.files.has(prior.storageKey!)).toBe(true);
  await purgeCvFiles({ ...kit.deps, now: () => new Date(Date.now() + 2 * 60 * 60 * 1000) });
  expect(kit.storage.files.has(prior.storageKey!)).toBe(true);
  expect((await db.cvUpload.findUniqueOrThrow({ where: { id: prior.id } })).storageKey).toBe(
    prior.storageKey,
  );
});
it('LinkedIn önerisi atılınca dosya ve geçici çıktı silinir', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  const upload = await uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  await processCvParse(kit.deps, upload.cvUploadId, fresh);
  await discardCv(kit.deps, actor, upload.cvUploadId);
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } })).toMatchObject({
    status: 'DISCARDED',
    storageKey: null,
    parsedJson: null,
  });
  expect(kit.storage.files.size).toBe(0);
});
