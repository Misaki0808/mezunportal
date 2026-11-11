// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
import { VerificationPanel } from './verification-panel';

it('mezun belgesi incelenirken hesabına dönebileceği bir eylem sunar', async () => {
  renderUi(
    await VerificationPanel({
      state: {
        status: 'AWAITING_REVIEW',
        emailKind: 'OTHER',
        memberships: [],
        pendingDocument: null,
        rejection: null,
      },
    }),
  );
  expect(screen.getByRole('link', { name: 'account' })).toHaveAttribute('href', '/hesap');
});

it('kişisel adres kullanan öğrenci ve akademisyene e-posta değiştirme yolunu gösterir', async () => {
  renderUi(
    await VerificationPanel({
      state: {
        status: 'NOT_STARTED',
        emailKind: 'OTHER',
        memberships: [],
        pendingDocument: null,
        rejection: null,
      },
    }),
  );
  expect(screen.getByText('personalEmailHint')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'changeEmail' })).toHaveAttribute(
    'href',
    '/hesap/e-posta',
  );
  expect(screen.getByRole('link', { name: 'upload' })).toHaveAttribute('href', '/dogrulama/belge');
});
