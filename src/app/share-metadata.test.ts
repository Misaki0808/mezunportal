import { expect, it, vi } from 'vitest';
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--body' }),
  Plus_Jakarta_Sans: () => ({ variable: '--heading' }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ APP_URL: 'https://portal.example.test' }) }));
import { generateMetadata } from './layout';

it('paylaşım adreslerini yapılandırılmış uygulama kökeninden üretir', async () => {
  const metadata = await generateMetadata();
  expect(new URL(String(metadata.metadataBase)).origin).toBe('https://portal.example.test');
});
