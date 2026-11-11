// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import messages from '../../../../../../messages/tr.json' with { type: 'json' };

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    (messages.jobs as unknown as Record<string, string>)[key] ?? key,
}));
vi.mock('@/server/actions/job-postings', () => ({
  previewJobPostingContact: mocks.preview,
  requestJobPostingContact: vi.fn(),
}));
vi.mock('@/components/job-postings/contact', () => ({
  PostingContactForm: () => <form aria-label="İletişim formu" />,
}));
import Page from './page';

beforeEach(() => vi.clearAllMocks());

const render = async () => renderUi(await Page({ params: Promise.resolve({ id: 'job-1' }) }));

it('her durumda sayfanın tek bir h1 başlığı vardır (ulaşılamaz, açık ve hata)', async () => {
  mocks.preview.mockResolvedValue({
    ok: true,
    data: {
      canRequest: false,
      organizationName: 'Örnek',
      postingTitle: 'Staj',
      requestableFields: [],
    },
  });
  const unavailable = await render();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.jobs.contactTitle);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    messages.jobs.contactUnavailable,
  );
  unavailable.unmount();

  mocks.preview.mockResolvedValue({
    ok: true,
    data: {
      canRequest: true,
      organizationName: 'Örnek',
      postingTitle: 'Staj',
      requestableFields: [],
    },
  });
  const open = await render();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  open.unmount();

  mocks.preview.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  await render();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});
