import { beforeEach, expect, it, vi } from 'vitest';
import { YEAR_ALUMNI_PUBLIC_PAGE_ACCESS } from '@/contracts/year-alumni';
const mocks = vi.hoisted(() => ({ rate: vi.fn(), award: vi.fn(), member: vi.fn(), db: {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Error('PUBLIC_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/env', () => ({
  getAuthEnv: () => ({ BETTER_AUTH_SECRET: 'fake-test-secret-with-no-real-value' }),
}));
vi.mock('@/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('@/server/auth/request-context', () => ({
  getRequestContext: async () => ({ clientIp: '192.0.2.7' }),
}));
vi.mock('@/server/auth/rate-limit', () => ({
  consumeRateLimit: mocks.rate,
  rateLimitKey: () => 'app:award-verification:opaque',
}));
vi.mock('@/server/services/year-alumni', () => ({ publicAward: mocks.award }));
vi.mock('@/server/permissions', () => ({ requireVerifiedMember: mocks.member }));
vi.mock('@/components/ui', () => ({
  BadgeCheckIcon: () => null,
  Card: () => null,
  IconChip: () => null,
  PageHeader: () => null,
}));
import Page, { metadata } from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.award.mockResolvedValue(null);
});
it.each(['unknown', 'private', 'revoked'])(
  '%s kodu aynı not-found akışına girer; kota önce tüketilir',
  async (kind) => {
    await expect(Page({ params: Promise.resolve({ kod: kind.padEnd(43, 'x') }) })).rejects.toThrow(
      'PUBLIC_NOT_FOUND',
    );
    expect(mocks.rate).toHaveBeenCalledWith(mocks.db, 'app:award-verification:opaque', {
      max: 60,
      windowSeconds: 60,
    });
    expect(mocks.rate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.award.mock.invocationCallOrder[0]!,
    );
  },
);
it.each(['public', 'unknown', 'private', 'revoked', 'deleted'])(
  'kota doluyken %s aynı not-found olur ve ödül varlığı sorgulanmaz',
  async (kind) => {
    mocks.rate.mockResolvedValue({ allowed: false });
    mocks.award.mockResolvedValue({
      name: 'Örnek',
      award: 'Yılın Mezunu',
      department: 'YBS',
      year: 2025,
      university: 'İÜ',
    });
    await expect(Page({ params: Promise.resolve({ kod: kind.padEnd(43, 'x') }) })).rejects.toThrow(
      'PUBLIC_NOT_FOUND',
    );
    expect(mocks.award).not.toHaveBeenCalled();
  },
);
it('sözleşmede gerekçeli açık sayfa anonime sunulur ve noindex kalır', async () => {
  expect(YEAR_ALUMNI_PUBLIC_PAGE_ACCESS['/dogrula/[kod]'].reason).not.toBe('');
  mocks.award.mockResolvedValue({
    name: 'Örnek',
    award: 'Yılın Mezunu',
    department: 'YBS',
    year: 2025,
    university: 'İstanbul Üniversitesi',
  });
  expect(await Page({ params: Promise.resolve({ kod: 'x'.repeat(43) }) })).toBeTruthy();
  expect(mocks.member).not.toHaveBeenCalled();
  expect(metadata.robots).toEqual({ index: false, follow: false });
});
