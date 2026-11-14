import { beforeEach, expect, it, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import { codedForbidden, codedUnauthenticated } from '@/lib/errors';
import { ErrorState } from '@/components/ui';

const spies = vi.hoisted(() => ({
  guard: vi.fn(),
  managed: vi.fn(),
  data: vi.fn(),
  db: vi.fn(),
  digest: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({
  requirePageVerifiedMember: spies.guard,
  requirePageAnyAdmin: spies.guard,
  managedDepartmentIds: spies.managed,
}));
vi.mock('@/server/db', () => ({ getDb: spies.db }));
vi.mock('@/server/services/monthly-digest', () => ({ buildMonthlyDigest: spies.digest }));
vi.mock('@/server/actions/referrals', () => ({
  listMyReferrals: spies.data,
  listReferralModeration: spies.data,
}));
vi.mock('@/server/actions/cv-review-request', () => ({
  listCvReviewRequests: spies.data,
  getCvReviewSettings: spies.data,
}));
vi.mock('@/server/actions/alumni-story', () => ({ listMyStories: spies.data }));
vi.mock('@/server/actions/campus-events', () => ({ listCampusEventModeration: spies.data }));
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccessStrict: spies.admin }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
for (const [path, name] of [
  ['@/components/notifications/digest-view', 'DigestView'],
  ['@/components/cv-review/review-inbox', 'ReviewInbox'],
  ['@/components/referrals/referral-ui', 'ReferralList'],
  ['@/components/alumni-story/editor', 'StoryEditor'],
  ['@/components/alumni-story/admin', 'StoryAdmin'],
  ['@/components/campus-events/event-code', 'EventCode'],
  ['@/components/campus-events/admin-events', 'AdminEvents'],
  ['@/components/year-alumni/admin', 'AwardAdmin'],
] as const)
  vi.doMock(path, () => ({ [name]: () => null }));
const pages = [
  ['hesap/aylik-ozet', () => import('@/app/(kimlik)/hesap/aylik-ozet/page'), 'AUTH_FORBIDDEN'],
  [
    'hesap/cv-inceleme',
    () => import('@/app/(kimlik)/hesap/cv-inceleme/page'),
    'AUTH_UNAUTHENTICATED',
  ],
  ['hesap/referanslar', () => import('@/app/(kvkk)/hesap/referanslar/page'), 'AUTH_FORBIDDEN'],
  ['hesap/hikayem', () => import('@/app/(profil)/hesap/hikayem/page'), 'AUTH_FORBIDDEN'],
  ['yonetim/aylik-ozet', () => import('@/app/(yonetim)/yonetim/aylik-ozet/page'), 'AUTH_FORBIDDEN'],
  [
    'yonetim/ayin-mezunu',
    () => import('@/app/(yonetim)/yonetim/ayin-mezunu/page'),
    'AUTH_FORBIDDEN',
  ],
  [
    'yonetim/etkinlikler',
    () => import('@/app/(yonetim)/yonetim/etkinlikler/page'),
    'AUTH_FORBIDDEN',
  ],
  [
    'yonetim/referanslar',
    () => import('@/app/(yonetim)/yonetim/referanslar/page'),
    'AUTH_FORBIDDEN',
  ],
  [
    'yonetim/yilin-mezunu',
    () => import('@/app/(yonetim)/yonetim/yilin-mezunu/page'),
    'AUTH_FORBIDDEN',
  ],
] as const;
const cases: [string, () => Promise<unknown>, string][] = [
  ...pages.map(
    ([name, load, denied]) =>
      [name, async () => (await load()).default(), denied] as [
        string,
        () => Promise<unknown>,
        string,
      ],
  ),
  [
    'yonetim/etkinlikler/[id]',
    async () =>
      (await import('@/app/(yonetim)/yonetim/etkinlikler/[id]/page')).default({
        params: Promise.resolve({ id: 'test' }),
      }),
    'AUTH_FORBIDDEN',
  ],
];
const capture = (fn: () => never): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('sinyal yok');
};
const untouched = () => {
  expect(spies.data).not.toHaveBeenCalled();
  expect(spies.db).not.toHaveBeenCalled();
  expect(spies.digest).not.toHaveBeenCalled();
  expect(spies.managed).not.toHaveBeenCalled();
};
beforeEach(() => {
  vi.resetAllMocks();
  spies.admin.mockResolvedValue(true);
});
for (const [name, run, denied] of cases) {
  it(`${name}: kodlu ret sessiz ve veri sorgusu yok`, async () => {
    const out = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      for (const error of [
        codedForbidden('AUTH_FORBIDDEN'),
        codedUnauthenticated('AUTH_UNAUTHENTICATED'),
      ]) {
        spies.guard.mockRejectedValue(error);
        const value = await run();
        expect(value).toMatchObject({ type: ErrorState, props: { errorCode: denied } });
        untouched();
        expect(out).not.toHaveBeenCalled();
      }
    } finally {
      out.mockRestore();
    }
  });
  it(`${name}: kodsuz arıza tek güvenli günlük, genel hata ve veri sorgusu yok`, async () => {
    const out = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const error = new Error('ayse@example.test secret synthetic-user');
      error.name = 'AyseYilmaz';
      spies.guard.mockRejectedValue(error);
      const value = await run();
      expect(value).toMatchObject({ type: ErrorState, props: { errorCode: 'SERVER_UNEXPECTED' } });
      untouched();
      expect(out).toHaveBeenCalledOnce();
      const line = String(out.mock.calls[0]![0]);
      expect(JSON.parse(line)).toMatchObject({ event: 'route.unexpected', errorName: 'Error' });
      expect(line).not.toMatch(/ayse|secret|synthetic-user|AyseYilmaz/);
    } finally {
      out.mockRestore();
    }
  });
  it(`${name}: Next kontrol sinyali aynen çıkar, günlük/veri sorgusu yok`, async () => {
    const out = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      for (const error of [
        capture(() => redirect('/giris')),
        capture(() => notFound()),
        Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' }),
      ]) {
        spies.guard.mockRejectedValue(error);
        await expect(run()).rejects.toBe(error);
        untouched();
        expect(out).not.toHaveBeenCalled();
      }
    } finally {
      out.mockRestore();
    }
  });
}

it('yönetim özeti ön kapısı arızalanırsa genel hata döner ve ikinci kapı/veri çalışmaz', async () => {
  const page = (await import('@/app/(yonetim)/yonetim/aylik-ozet/page')).default;
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    spies.admin.mockRejectedValue(new Error('ayse@example.test'));
    expect(await page()).toMatchObject({
      type: ErrorState,
      props: { errorCode: 'SERVER_UNEXPECTED' },
    });
    expect(spies.guard).not.toHaveBeenCalled();
    untouched();
    expect(write).toHaveBeenCalledOnce();
    expect(String(write.mock.calls[0]![0])).not.toContain('ayse');
  } finally {
    write.mockRestore();
  }
});

it('yönetim özeti: yönetici olmayan doğrulanmış üye yetki hatası alır; üye kapısı ve özet çalışmaz', async () => {
  const page = (await import('@/app/(yonetim)/yonetim/aylik-ozet/page')).default;
  spies.admin.mockResolvedValue(false);
  spies.guard.mockResolvedValue({ userId: 'member' });
  expect(await page()).toMatchObject({ type: ErrorState, props: { errorCode: 'AUTH_FORBIDDEN' } });
  expect(spies.guard).not.toHaveBeenCalled();
  untouched();
});
