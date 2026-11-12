import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { DEMO_CV_OUTPUT } from '../external/llm/fake';
import type { RedactedCvRequest } from '../external/llm/types';
import { withCvTextRedaction } from '../external/pdf-text';
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
            'İPEK IŞIK\nipek@example.com\n+90 532 123 45 67\nİstanbul Üniversitesi\nSQL',
        }),
      };
      const upload = await uploadCv(deps, actor, { ...pdfForm(), source });
      expect(await processCvParse(deps, upload.cvUploadId, fresh)).toBe('PARSED');
      expect(raw).not.toHaveBeenCalled();
      expect(redacted).toHaveBeenCalledOnce();
      const request = redacted.mock.calls[0]![0] as { text: string; pdf?: unknown };
      expect(request.text).not.toMatch(/İPEK|IŞIK|ipek@example|532 123/);
      expect(request.text).toContain('İstanbul Üniversitesi');
      expect(request.text).toContain('SQL');
      expect(request).not.toHaveProperty('pdf');
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
});
