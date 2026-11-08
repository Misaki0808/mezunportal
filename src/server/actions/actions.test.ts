import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedUnauthenticated } from '@/lib/errors';

// Eylemler ince yapıştırıcıdır: sıra (kimlik → doğrulama → servis) ve hata biçimi burada sınanır.
// Servisler gerçek veritabanıyla kendi testlerinde sınanır.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getAuth: vi.fn(),
  uploadService: vi.fn(),
  reviewService: vi.fn(),
  listService: vi.fn(),
  requestLinkService: vi.fn(),
  declareService: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ 'x-forwarded-for': '203.0.113.9', 'x-mezun-path': '/dogrulama/uyelik?adim=2' }),
}));
vi.mock('../permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('../auth', () => ({ getAuth: mocks.getAuth, getAuthEmailPort: () => ({}) }));
vi.mock('../db', () => ({ getDb: () => ({}) }));
vi.mock('./deps', () => ({ authFlowDeps: () => ({}), documentDeps: () => ({}) }));
vi.mock('../services/graduation-document', () => ({
  uploadGraduationDocument: mocks.uploadService,
  reviewGraduationDocument: mocks.reviewService,
  listPendingGraduationDocuments: mocks.listService,
}));
vi.mock('../services/auth-flow', () => ({
  requestSignInLink: mocks.requestLinkService,
  declareMembership: mocks.declareService,
  getSignInOptions: () => ({
    linkedin: { enabled: false, disabledReason: 'AUTH_PROVIDER_NOT_CONFIGURED' },
  }),
  startLinkedInSignIn: vi.fn(),
  requestEmailChange: vi.fn(),
  listSelectableDepartments: vi.fn(),
  getVerificationState: vi.fn(),
}));

import {
  requestSignInLink,
  signInAsTestPersona,
  declareMembership,
  getSignInOptions,
  signOut,
} from './auth';
import {
  listPendingGraduationDocuments,
  reviewGraduationDocument,
  uploadGraduationDocument,
} from './graduation-document';

const ACTOR = { userId: 'u1', facts: {} };

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireUser.mockResolvedValue(ACTOR);
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('APP_URL', 'http://localhost:3162');
  vi.stubEnv('BETTER_AUTH_SECRET', 'dev-only-insecure-secret-for-local-and-test-0000');
  vi.stubEnv('SMTP_HOST', '127.0.0.1');
  vi.stubEnv('SMTP_PORT', '1025');
  vi.stubEnv('EMAIL_FROM', 'a <a@b.co>');
});

describe('test girişi eylemi', () => {
  it('PROD’DA her şeyden ÖNCE reddedilir: Better Auth’a hiç dokunulmaz', async () => {
    vi.stubEnv('APP_ENV', 'prod');
    vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(48));
    mocks.getAuth.mockImplementation(() => {
      throw new Error('getAuth çağrılmamalıydı');
    });

    const result = await signInAsTestPersona({ persona: 'systemAdmin' });

    expect(result).toEqual({ ok: false, errorCode: 'AUTH_TEST_LOGIN_DISABLED' });
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it('APP_ENV tanımsız/hatalıysa da kapalıdır (güvenli taraf)', async () => {
    for (const value of ['', 'staging', 'production']) {
      vi.stubEnv('APP_ENV', value);
      expect(await signInAsTestPersona({ persona: 'student' })).toEqual({
        ok: false,
        errorCode: 'AUTH_TEST_LOGIN_DISABLED',
      });
    }
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it('local/test’te bilinmeyen kişi alan hatasıyla döner; eklenti yoksa yine kapalı', async () => {
    mocks.getAuth.mockReturnValue({ api: {} }); // eklenti yüklenmemiş (örn. yanlış ortam)
    expect(await signInAsTestPersona({ persona: 'student' })).toEqual({
      ok: false,
      errorCode: 'AUTH_TEST_LOGIN_DISABLED',
    });
    const testLogin = vi.fn();
    mocks.getAuth.mockReturnValue({ api: { testLogin } });
    expect(await signInAsTestPersona({ persona: 'root' as never })).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { persona: 'VALIDATION_INVALID' },
    });
    expect(testLogin).not.toHaveBeenCalled();
    expect(await signInAsTestPersona({ persona: 'student' })).toEqual({
      ok: true,
      data: { signedIn: true },
    });
    expect(testLogin).toHaveBeenCalledWith(
      expect.objectContaining({ body: { persona: 'student' } }),
    );
  });

  it('kişi veritabanında yoksa RESOURCE_NOT_FOUND', async () => {
    mocks.getAuth.mockReturnValue({
      api: { testLogin: vi.fn().mockRejectedValue({ body: { code: 'TEST_PERSONA_NOT_FOUND' } }) },
    });
    expect(await signInAsTestPersona({ persona: 'student' })).toEqual({
      ok: false,
      errorCode: 'RESOURCE_NOT_FOUND',
    });
  });
});

describe('giriş eylemleri', () => {
  it('geçersiz e-posta servise ulaşmadan VALIDATION_INVALID + alan hatası', async () => {
    const result = await requestSignInLink({ email: 'gecersiz' });
    expect(result).toEqual({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { email: 'VALIDATION_INVALID' },
    });
    expect(mocks.requestLinkService).not.toHaveBeenCalled();
  });

  it('geçerli e-posta normalleştirilip servise gider; istemci adresi bağlamdan gelir', async () => {
    mocks.requestLinkService.mockResolvedValue({ status: 'CHECK_EMAIL' });
    const result = await requestSignInLink({ email: '  AYSE@Example.TEST ' });
    expect(result).toEqual({ ok: true, data: { status: 'CHECK_EMAIL' } });
    expect(mocks.requestLinkService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'ayse@example.test', clientIp: '203.0.113.9' }),
    );
  });

  it('hız sınırı hatası errorCode + parametreyle döner (fırlatılmaz)', async () => {
    const { codedRateLimited } = await import('@/lib/errors');
    mocks.requestLinkService.mockRejectedValue(
      codedRateLimited('RATE_LIMITED', { retryAfterSeconds: 120 }),
    );
    expect(await requestSignInLink({ email: 'a@b.co' })).toEqual({
      ok: false,
      errorCode: 'RATE_LIMITED',
      params: { retryAfterSeconds: 120 },
    });
  });

  it('beklenmeyen hata SERVER_UNEXPECTED olur; ham ileti sızmaz', async () => {
    mocks.requestLinkService.mockRejectedValue(
      new Error('bağlantı postgresql://mezun:gizli@127.0.0.1 koptu'),
    );
    const result = await requestSignInLink({ email: 'a@b.co' });
    expect(result).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect(JSON.stringify(result)).not.toContain('gizli');
  });

  it('beyan: oturum önce, doğrulama sonra; oturumsuzda AUTH_UNAUTHENTICATED ve servis çağrılmaz', async () => {
    mocks.requireUser.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    // Oturum düşmüş: ortak işleyici girişe, dönüş yoluyla yönlendirir (hata değeri dönmez).
    await expect(declareMembership({ role: 'ACADEMIC', departmentId: 'd1' })).rejects.toMatchObject(
      {
        digest: expect.stringContaining('/giris?donus=%2Fdogrulama%2Fuyelik%3Fadim%3D2'),
      },
    );
    expect(mocks.declareService).not.toHaveBeenCalled();

    mocks.requireUser.mockResolvedValue(ACTOR);
    const bad = await declareMembership({ role: 'ALUMNI', departmentId: 'd1' } as never);
    expect(bad).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.declareService).not.toHaveBeenCalled();
  });

  it('giriş seçenekleri LinkedIn kapalıyken sebebi taşır; çıkış idempotenttir (oturum yoksa da başarılı)', async () => {
    expect(await getSignInOptions()).toEqual({
      ok: true,
      data: { linkedin: { enabled: false, disabledReason: 'AUTH_PROVIDER_NOT_CONFIGURED' } },
    });
    mocks.getAuth.mockReturnValue({
      api: { signOut: vi.fn().mockRejectedValue(new Error('oturum yok')) },
    });
    expect(await signOut()).toEqual({ ok: true, data: { signedOut: true } });
  });
});

describe('mezun belgesi eylemleri', () => {
  const formWith = (fields: Record<string, string | File>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    return formData;
  };
  const pdf = (size = 100) =>
    new File([new Uint8Array(new ArrayBuffer(size))], 'b.pdf', { type: 'application/pdf' });

  it('yükleme: oturumsuz istekte gövde İŞLENMEZ (kimlik önce)', async () => {
    mocks.requireUser.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    await expect(
      uploadGraduationDocument(
        formWith({ departmentId: 'd', graduationYear: '2025', file: pdf() }),
      ),
    ).rejects.toMatchObject({ digest: expect.stringContaining('/giris?donus=') });
    expect(mocks.uploadService).not.toHaveBeenCalled();
  });

  it('yükleme: dosya hataları alan alan döner (türü/boyutu/boş), servise ulaşmaz', async () => {
    const png = new File([new Uint8Array(new ArrayBuffer(10))], 'b.png', { type: 'image/png' });
    expect(
      await uploadGraduationDocument(
        formWith({ departmentId: 'd', graduationYear: '2025', file: png }),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { file: 'DOCUMENT_NOT_PDF' } });
    expect(
      await uploadGraduationDocument(
        formWith({ departmentId: 'd', graduationYear: '2025', file: pdf(5 * 1024 * 1024 + 1) }),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { file: 'DOCUMENT_TOO_LARGE' } });
    expect(
      await uploadGraduationDocument(formWith({ departmentId: 'd', graduationYear: '2025' })),
    ).toMatchObject({ ok: false, fieldErrors: { file: 'DOCUMENT_REQUIRED' } });
    expect(mocks.uploadService).not.toHaveBeenCalled();
  });

  it('yükleme: 5 MB PDF servise geçer; istemci kullanıcı kimliği gönderse bile oturumdaki aktör kullanılır', async () => {
    mocks.uploadService.mockResolvedValue({ documentId: 'doc1', status: 'PENDING' });
    const result = await uploadGraduationDocument(
      formWith({
        departmentId: 'd',
        graduationYear: '2025',
        file: pdf(5 * 1024 * 1024),
        userId: 'baskasi',
      }),
    );
    expect(result).toEqual({ ok: true, data: { documentId: 'doc1', status: 'PENDING' } });
    expect(mocks.uploadService).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      expect.not.objectContaining({ userId: expect.anything() }),
    );
  });

  it('karar: gerekçesiz ret servise ulaşmadan AUDIT_REASON_REQUIRED alan hatasıyla döner', async () => {
    const result = await reviewGraduationDocument({
      decision: 'REJECT',
      documentId: 'doc1',
      reason: '  ',
    } as never);
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { reason: 'AUDIT_REASON_REQUIRED' },
    });
    expect(mocks.reviewService).not.toHaveBeenCalled();
  });

  it('karar: oturumdaki kullanıcı yönetici kimliği olarak servise verilir (istemci verisi değil)', async () => {
    mocks.reviewService.mockResolvedValue({ documentId: 'doc1', decision: 'APPROVE' });
    await reviewGraduationDocument({ decision: 'APPROVE', documentId: 'doc1' });
    expect(mocks.reviewService).toHaveBeenCalledWith(expect.anything(), ACTOR, {
      decision: 'APPROVE',
      documentId: 'doc1',
    });
  });

  it('kuyruk: sayfa boyutu sınırı doğrulanır', async () => {
    expect(await listPendingGraduationDocuments({ limit: 500 })).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
    });
    expect(mocks.listService).not.toHaveBeenCalled();
  });
});
