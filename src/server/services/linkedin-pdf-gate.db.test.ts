import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { buildRealTestPdf } from '@/test/real-pdf';
import { getCvAvailability, uploadCv } from './cv';
import { processCvParse } from './cv-parse';
import { getPdfTextExtractor } from '../external/pdf-text';
import { DEMO_CV_OUTPUT } from '../external/llm/fake';

// Gizlilik kapısı: sağlayıcı "gerçek" (adı 'fake' DEĞİL) ve maskeleyici yokken ham metin ya da PDF nereye gider?
// Kapı iki yerde korunur (cv.ts yükleme, cv-parse.ts işleme); her birini tek başına kıran mutasyonlar bu dosyada kırmızı verir.
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const fresh = { retryCount: 0, retryLimit: 2 };

function spies() {
  const calls = {
    parseCv: [] as unknown[],
    parseRedactedCv: [] as unknown[],
    extract: 0,
    redact: 0,
  };
  const llm = {
    provider: 'example-real',
    parseCv: async (r: unknown) => {
      calls.parseCv.push(r);
      return DEMO_CV_OUTPUT;
    },
    parseRedactedCv: async (r: unknown) => {
      calls.parseRedactedCv.push(r);
      return DEMO_CV_OUTPUT;
    },
  };
  const real = getPdfTextExtractor();
  const extractor = {
    kind: 'real' as const,
    extract: async (pdf: Uint8Array) => {
      calls.extract++;
      return real.extract(pdf);
    },
  };
  return { calls, llm, extractor };
}

it('LinkedIn kaydı var, sağlayıcı gerçek, maskeleyici YOK: ne metin çıkarılır ne sağlayıcı çağrılır', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db); // sahte LLM ile yükleme (allowFakeLinkedin: test altyapısı)
  const upload = await uploadCv(kit.deps, actor, {
    file: new File(
      [new Uint8Array(buildRealTestPdf(['Experience', 'GIZLI-AD-SOYAD', 'Skills']))],
      'in.pdf',
      { type: 'application/pdf' },
    ),
    source: 'LINKEDIN_PDF',
  });
  const s = spies();
  const deps = { ...kit.deps, llm: s.llm, pdfTextExtractor: s.extractor };
  const outcome = await processCvParse(deps, upload.cvUploadId, fresh);
  expect(outcome).not.toBe('PARSED');
  const row = await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } });
  expect(row.status).toBe('FAILED');
  expect(row.errorCode).toBe('CV_PARSE_UNAVAILABLE');
  expect(s.calls.extract).toBe(0);
  expect(s.calls.parseCv).toHaveLength(0);
  expect(s.calls.parseRedactedCv).toHaveLength(0);
});

it('gerçek sağlayıcı + allowFakeLinkedin açık olsa bile LinkedIn yüklemesi reddedilir; availability.linkedinPdf kapalı', async () => {
  const { actor, userId } = await cvUser(db);
  const kit = cvKit(db, { allowFakeLinkedin: true });
  const s = spies();
  const deps = { ...kit.deps, llm: s.llm, pdfTextExtractor: s.extractor };
  await expect(
    uploadCv(deps, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' }),
  ).rejects.toMatchObject({ code: 'CV_LINKEDIN_UNAVAILABLE' });
  expect(await db.cvUpload.count({ where: { userId } })).toBe(0);
  expect((await getCvAvailability(deps, actor)).linkedinPdf).toBe(false);
  // uygulamanın gerçek bağlantısı: çıkarıcı gerçek, redact yok, allowFakeLinkedin yok
  const wired = {
    ...kit.deps,
    allowFakeLinkedin: undefined,
    llm: kit.llm,
    pdfTextExtractor: getPdfTextExtractor(),
  };
  expect((await getCvAvailability(wired, actor)).linkedinPdf).toBe(false);
  await expect(
    uploadCv(wired, actor, { ...pdfForm(), source: 'LINKEDIN_PDF' }),
  ).rejects.toMatchObject({ code: 'CV_LINKEDIN_UNAVAILABLE' });
});

it('normal CV: maskeleyici yoksa yükleme ve işleme kapalı, ham PDF sağlayıcıya gitmez', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  const s = spies();
  const deps = { ...kit.deps, llm: s.llm, pdfTextExtractor: s.extractor };
  await expect(uploadCv(deps, actor, pdfForm())).rejects.toMatchObject({
    code: 'CV_PROVIDER_NOT_CONFIGURED',
  });
  const upload = await uploadCv(kit.deps, actor, pdfForm());
  const outcome = await processCvParse(deps, upload.cvUploadId, fresh);
  expect(outcome).toBe('FAILED');
  expect(s.calls.extract).toBe(0);
  expect(s.calls.parseRedactedCv).toHaveLength(0);
  expect(s.calls.parseCv).toHaveLength(0);
});

it('sahte sağlayıcı + LinkedIn: metin yalnız bölüm ipucu olarak kullanılır, sağlayıcıya metin gitmez', async () => {
  const { actor } = await cvUser(db);
  const kit = cvKit(db);
  const received: unknown[] = [];
  const llm = {
    provider: 'fake',
    parseCv: async (r: unknown) => {
      received.push(r);
      return DEMO_CV_OUTPUT;
    },
  };
  const deps = { ...kit.deps, llm, pdfTextExtractor: getPdfTextExtractor() };
  const upload = await uploadCv(deps, actor, {
    file: new File(
      [new Uint8Array(buildRealTestPdf(['Experience', 'ISIM-SOYISIM-TELEFON', 'Skills', 'SQL']))],
      'in.pdf',
      { type: 'application/pdf' },
    ),
    source: 'LINKEDIN_PDF',
  });
  expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
  expect(
    JSON.stringify(received, (_k, v) => (v instanceof Uint8Array ? '[bayt]' : v)),
  ).not.toContain('ISIM-SOYISIM');
  expect((received[0] as { sectionHints?: string[] }).sectionHints).toEqual([
    'experience',
    'skills',
  ]);
});
