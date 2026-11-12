import { afterAll, expect, it } from 'vitest';
import { applyCvSchema } from '@/contracts/cv';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm, rawForm } from '@/test/cv';
import { buildRealTestPdf } from '@/test/real-pdf';
import { applyCv, discardCv, getCvReview, uploadCv } from './cv';
import { processCvParse, purgeCvFiles } from './cv-parse';
import { createFakePdfTextExtractor, getPdfTextExtractor } from '../external/pdf-text';
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
  await processCvParse(
    { ...kit.deps, pdfTextExtractor: createFakePdfTextExtractor() },
    linked.cvUploadId,
    fresh,
  );
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
  await processCvParse(
    { ...kit.deps, pdfTextExtractor: createFakePdfTextExtractor() },
    upload.cvUploadId,
    fresh,
  );
  await discardCv(kit.deps, actor, upload.cvUploadId);
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } })).toMatchObject({
    status: 'DISCARDED',
    storageKey: null,
    parsedJson: null,
  });
  expect(kit.storage.files.size).toBe(0);
});
it('metin portu yoksa sağlayıcı çağrılmadan güvenli hata verir ve dosya silinir', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  const upload = await uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  expect(await processCvParse(kit.deps, upload.cvUploadId, fresh)).toBe('FAILED');
  expect(kit.llm.calls).toBe(0);
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } })).toMatchObject({
    status: 'FAILED',
    errorCode: 'CV_PARSE_UNAVAILABLE',
    storageKey: null,
  });
  expect(kit.storage.files.size).toBe(0);
});
it('port sonucu yalnız bölüm adları olarak sağlayıcıya iletilir', async () => {
  const { createFakeLlm, DEMO_CV_OUTPUT } = await import('../external/llm/fake');
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  let captured: unknown;
  const llm = createFakeLlm({
    scenarios: {
      demo: (request) => {
        captured = request.sectionHints;
        return DEMO_CV_OUTPUT;
      },
    },
  });
  const deps = {
    ...kit.deps,
    llm,
    pdfTextExtractor: { extract: async () => 'Experience\nKişisel içerik\nSkills\nSQL' },
  };
  const upload = await uploadCv(deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
  expect(captured).toEqual(['experience', 'skills']);
  expect(JSON.stringify(captured)).not.toContain('Kişisel');
});
it('gerçek sağlayıcı ve metin portu olsa bile maskeleme bağlanmadan ham PDF iletilmez', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  let called = false;
  const llm = {
    provider: 'future-real',
    parseCv: async () => {
      called = true;
      return {};
    },
  };
  const deps = { ...kit.deps, llm, pdfTextExtractor: createFakePdfTextExtractor() };
  await expect(
    uploadCv(deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' }),
  ).rejects.toMatchObject({ code: 'CV_LINKEDIN_UNAVAILABLE' });
  const upload = await uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
  expect(called).toBe(false);
  expect(kit.storage.files.size).toBe(0);
});
it('LinkedIn kararsız PDF 24 saatte anında silinir; normal CV yedi gün bekler', async () => {
  const first = await cvUser(db);
  const second = await cvUser(db);
  const kit = cvKit(db);
  const linked = await uploadCv(kit.deps, first.actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  const normal = await uploadCv(kit.deps, second.actor, pdfForm());
  await processCvParse(
    { ...kit.deps, pdfTextExtractor: createFakePdfTextExtractor() },
    linked.cvUploadId,
    fresh,
  );
  await processCvParse(kit.deps, normal.cvUploadId, fresh);
  const linkedRow = await db.cvUpload.findUniqueOrThrow({ where: { id: linked.cvUploadId } });
  const normalRow = await db.cvUpload.findUniqueOrThrow({ where: { id: normal.cvUploadId } });
  const before = new Date(linkedRow.createdAt.getTime() + 24 * 60 * 60 * 1000 - 1);
  await purgeCvFiles({ ...kit.deps, now: () => before });
  expect((await db.cvUpload.findUniqueOrThrow({ where: { id: linked.cvUploadId } })).status).toBe(
    'PARSED',
  );
  const boundary = new Date(
    Math.max(linkedRow.createdAt.getTime(), normalRow.createdAt.getTime()) + 24 * 60 * 60 * 1000,
  );
  await purgeCvFiles({ ...kit.deps, now: () => boundary });
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: linked.cvUploadId } })).toMatchObject({
    status: 'DISCARDED',
    storageKey: null,
    parsedJson: null,
  });
  expect(kit.storage.files.has(linkedRow.storageKey!)).toBe(false);
  expect(await db.cvUpload.findUniqueOrThrow({ where: { id: normal.cvUploadId } })).toMatchObject({
    status: 'PARSED',
    storageKey: normalRow.storageKey,
  });
});
it('gerçek port, maskeleme ve metin sağlayıcısı birlikte bağlanınca seçenek açılır; ham PDF gönderilmez', async () => {
  const { getCvAvailability } = await import('./cv');
  const { DEMO_CV_OUTPUT } = await import('../external/llm/fake');
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  let received: unknown;
  let rawCalled = false;
  const llm = {
    provider: 'example-real',
    parseCv: async () => {
      rawCalled = true;
      return {};
    },
    parseRedactedCv: async (request: { text: string }) => {
      received = request;
      return DEMO_CV_OUTPUT;
    },
  };
  const extractor = {
    kind: 'real' as const,
    extract: async () => 'Experience\nKişiselAd\nSkills\nSQL',
    redact: async (text: string) => text.replace('KişiselAd', '[gizli]'),
  };
  const deps = { ...kit.deps, llm, pdfTextExtractor: extractor };
  expect((await getCvAvailability(kit.deps, actor)).linkedinPdf).toBe(false);
  expect(
    (
      await getCvAvailability(
        { ...deps, pdfTextExtractor: { kind: 'real', extract: extractor.extract } },
        actor,
      )
    ).linkedinPdf,
  ).toBe(false);
  expect((await getCvAvailability(deps, actor)).linkedinPdf).toBe(true);
  const upload = await uploadCv(deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
  expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
  expect(rawCalled).toBe(false);
  expect(received).toMatchObject({ text: 'Experience\n[gizli]\nSkills\nSQL' });
  expect(JSON.stringify(received)).not.toContain('KişiselAd');
  expect(received).not.toHaveProperty('pdf');
});
it('çıkarıcı yokken doğrudan LinkedIn yüklemesi depoya yazılmadan reddedilir', async () => {
  const { actor, userId } = await cvUser(db);
  const kit = cvKit(db, { allowFakeLinkedin: false });
  await expect(
    uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' }),
  ).rejects.toMatchObject({ code: 'CV_LINKEDIN_UNAVAILABLE' });
  expect(await db.cvUpload.count({ where: { userId } })).toBe(0);
  expect(kit.storage.files.size).toBe(0);
});

it.each(['QUEUED', 'PARSING'] as const)(
  'LinkedIn %s durumunda takılsa bile yüklemeden 24 saat sonra dosya silinir',
  async (status) => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db);
    const upload = await uploadCv(kit.deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' });
    if (status === 'PARSING')
      await db.cvUpload.update({ where: { id: upload.cvUploadId }, data: { status } });
    const row = await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } });
    await purgeCvFiles({
      ...kit.deps,
      now: () => new Date(row.createdAt.getTime() + 24 * 60 * 60 * 1000),
    });
    expect(await db.cvUpload.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: 'DISCARDED',
      storageKey: null,
      parsedJson: null,
    });
    expect(kit.storage.files.has(row.storageKey!)).toBe(false);
  },
);

it('gerçek PDF metni çıkarılarak sahte sağlayıcıyla öneri üretilir, onay öncesi profile yazılmaz', async () => {
  const { createFakeLlm, DEMO_CV_OUTPUT } = await import('../external/llm/fake');
  const { actor, userId } = await cvUser(db);
  const kit = cvKit(db);
  let sections: unknown;
  const llm = createFakeLlm({
    scenarios: {
      demo: (request) => {
        sections = request.sectionHints;
        return DEMO_CV_OUTPUT;
      },
    },
  });
  const deps = { ...kit.deps, llm, pdfTextExtractor: getPdfTextExtractor() };
  const pdf = buildRealTestPdf([
    'Experience',
    'Sample Company',
    'Education',
    'Sample School',
    'Skills',
    'SQL',
  ]);
  const upload = await uploadCv(deps, actor, { ...rawForm(pdf), source: 'LINKEDIN_PDF' });
  expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
  expect(sections).toEqual(['experience', 'education', 'skills']);
  expect(await db.position.count({ where: { userId } })).toBe(0);
  expect((await getCvReview(deps, actor, upload.cvUploadId)).items.length).toBeGreaterThan(0);
});
