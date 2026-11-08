import { afterEach, expect, it, vi } from 'vitest';
import OnboardingTestPage from './page';

vi.mock('@/server/permissions', () => ({ requireUser: vi.fn(async () => ({ userId: 'test' })) }));
afterEach(() => vi.unstubAllEnvs());
it.each(['prod', 'local', ''])('sahte ekran rotası %s ortamında kapalıdır', async (value) => {
  vi.stubEnv('APP_ENV', value);
  await expect(OnboardingTestPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
});
