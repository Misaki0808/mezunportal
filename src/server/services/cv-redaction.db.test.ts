import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm, rawForm } from '@/test/cv';
import { buildFlateBombPdf, buildRealTestPdf } from '@/test/real-pdf';
import { DEMO_CV_OUTPUT } from '../external/llm/fake';
import type { RedactedCvRequest } from '../external/llm/types';
import { getPdfTextExtractor, withCvTextRedaction } from '../external/pdf-text';
import { getCvAvailability, uploadCv } from './cv';
import { processCvParse } from './cv-parse';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const fresh = { retryCount: 0, retryLimit: 0 };

describe('gerçek sağlayıcı sınırı', () => {
  it.each(['CV', 'LINKEDIN_PDF'] as const)(
    '%s: adı sunucudan alır, yalnız maskeli metni gönderir',
    async (source) => {
      const { userId, actor } = await cvUser(db);
      await db.user.update({ where: { id: userId }, data: { name: 'İpek Işık' } });
      const kit = cvKit(db);
      const raw = vi.fn(async () => DEMO_CV_OUTPUT);
      const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
      const deps = {
        ...kit.deps,
        llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
        pdfTextExtractor: withCvTextRedaction({
          kind: 'real' as const,
          extract: async () =>
            'Sayın IPEK ISIK\nselin . yilmaz [at] ogr . example . edu . tr\n+90 532\n123 45 67\n100.000.001.46\nİstanbul Üniversitesi\nSQL',
        }),
      };
      const upload = await uploadCv(deps, actor, { ...pdfForm(), source });
      expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
      expect(raw).not.toHaveBeenCalled();
      expect(redacted).toHaveBeenCalledOnce();
      const request = redacted.mock.calls[0]![0] as { text: string; pdf?: unknown };
      expect(request.text).not.toMatch(/IPEK|ISIK|selin|yilmaz|ogr|532|100\.000/);
      for (const token of ['[AD]', '[E-POSTA]', '[TELEFON]', '[KİMLİK]'])
        expect(request.text).toContain(token);
      expect(request.text).toContain('İstanbul Üniversitesi');
      expect(request.text).toContain('SQL');
      expect(request).not.toHaveProperty('pdf');
      expect(request).not.toHaveProperty('ownerName');
    },
  );
  it('maskeleyici yoksa normal CV de gerçek sağlayıcıya kapalıdır', async () => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db);
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw },
      pdfTextExtractor: null,
    };
    expect((await getCvAvailability(deps, actor)).available).toBe(false);
    await expect(uploadCv(deps, actor, pdfForm())).rejects.toMatchObject({
      code: 'CV_PROVIDER_NOT_CONFIGURED',
    });
    const upload = await uploadCv(kit.deps, actor, pdfForm());
    expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
    expect(raw).not.toHaveBeenCalled();
  });
  it('sunucu hesabında ad boşsa dış sağlayıcı çağrılmaz', async () => {
    const { actor, userId } = await cvUser(db);
    const kit = cvKit(db);
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
      pdfTextExtractor: withCvTextRedaction({ kind: 'real', extract: async () => 'SQL' }),
    };
    const upload = await uploadCv(deps, actor, pdfForm());
    await db.user.update({ where: { id: userId }, data: { name: ' ' } });
    expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
    expect(raw).not.toHaveBeenCalled();
    expect(redacted).not.toHaveBeenCalled();
  });
  it.each(['CV', 'LINKEDIN_PDF'] as const)(
    '%s: çıkarıcı güvenlik nedeniyle reddederse sağlayıcı çağrılmaz',
    async (source) => {
      const { actor } = await cvUser(db);
      const kit = cvKit(db);
      const raw = vi.fn(async () => DEMO_CV_OUTPUT);
      const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
      const deps = {
        ...kit.deps,
        llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
        pdfTextExtractor: withCvTextRedaction({
          kind: 'real',
          extract: async () => {
            throw new Error('sınır');
          },
        }),
      };
      const upload = await uploadCv(deps, actor, { ...pdfForm(), source });
      expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
      expect(raw).not.toHaveBeenCalled();
      expect(redacted).not.toHaveBeenCalled();
    },
  );
  it('normal CV gerçek çıkarıcıyla okunur ve sağlayıcı yalnız maskeli metni görür', async () => {
    const { actor, userId } = await cvUser(db);
    await db.user.update({ where: { id: userId }, data: { name: 'Suna Karaca' } });
    const kit = cvKit(db);
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
      pdfTextExtractor: withCvTextRedaction(getPdfTextExtractor()),
    };
    const pdf = buildRealTestPdf(['Suna Karaca suna@example.com SQL']);
    const upload = await uploadCv(deps, actor, rawForm(pdf));
    expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
    expect(raw).not.toHaveBeenCalled();
    const request = redacted.mock.calls[0]![0];
    expect(request.text).toContain('SQL');
    expect(request.text).not.toMatch(/Suna|Karaca|suna@example/);
    expect(request).not.toHaveProperty('pdf');
  });
  it('normal CV sıkıştırma bombasında bellek bekçisi sağlayıcı çağrısından önce kapatır', async () => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db);
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
    const extractor = getPdfTextExtractor({ maxRssGrowthBytes: 48 * 1024 * 1024 });
    const extract = vi.spyOn(extractor, 'extract');
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
      pdfTextExtractor: withCvTextRedaction(extractor),
    };
    const upload = await uploadCv(deps, actor, rawForm(buildFlateBombPdf(160)));
    expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
    expect(extract).toHaveBeenCalledOnce();
    await expect(extract.mock.results[0]!.value).rejects.toMatchObject({
      code: 'CV_PDF_UNREADABLE',
    });
    expect(raw).not.toHaveBeenCalled();
    expect(redacted).not.toHaveBeenCalled();
  });
});

it.each(['CV', 'LINKEDIN_PDF'] as const)(
  '%s: boş maske sonucu ham PDF yoluna düşmez',
  async (source) => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db);
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const redacted = vi.fn(async (_request: RedactedCvRequest) => DEMO_CV_OUTPUT);
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
      pdfTextExtractor: {
        kind: 'real' as const,
        extract: async () => 'SQL',
        redact: async () => '',
      },
    };
    const upload = await uploadCv(deps, actor, { ...pdfForm(), source });
    expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('FAILED');
    expect(raw).not.toHaveBeenCalled();
    expect(redacted).not.toHaveBeenCalled();
  },
);

it.each(['CV', 'LINKEDIN_PDF'] as const)(
  '%s: sağlayıcı hatasındaki metin veya ad günlüğe çıkmaz',
  async (source) => {
    const { actor, userId } = await cvUser(db);
    await db.user.update({ where: { id: userId }, data: { name: 'Suna Karaca' } });
    const kit = cvKit(db);
    const confidential = 'Suna Karaca suna [at] example.org +90 532 123 45 67';
    const raw = vi.fn(async () => DEMO_CV_OUTPUT);
    const redacted = vi.fn(async (_request: RedactedCvRequest): Promise<unknown> => {
      throw new Error(confidential);
    });
    const deps = {
      ...kit.deps,
      llm: { provider: 'real-test', parseCv: raw, parseRedactedCv: redacted },
      pdfTextExtractor: withCvTextRedaction({ kind: 'real', extract: async () => confidential }),
    };
    const upload = await uploadCv(deps, actor, { ...pdfForm(), source });
    const writes: string[] = [];
    const log = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    let result: unknown;
    try {
      result = await processCvParse(deps, upload.cvUploadId, fresh);
    } finally {
      log.mockRestore();
    }
    expect(result).toBe('FAILED');
    expect(raw).not.toHaveBeenCalled();
    expect(redacted).toHaveBeenCalledOnce();
    const messages = writes.join('');
    expect(messages).toContain('[cv] failed CV_PARSE_UNAVAILABLE');
    for (const secret of [
      confidential,
      'Suna',
      'Karaca',
      'suna [at]',
      '[AD]',
      '[E-POSTA]',
      '[TELEFON]',
    ])
      expect(messages).not.toContain(secret);
  },
);
