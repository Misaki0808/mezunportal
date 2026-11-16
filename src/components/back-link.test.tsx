// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import messages from '../../messages/tr.json';
import { renderUi } from '@/test/render';
import { AccountFrameView } from './account/account-frame';
import { AdminFrame } from './admin/frame';

it('hesap ve yönetimde aynı erişilebilir geri bağlantısını kullanır', () => {
  renderUi(
    <>
      <AccountFrameView eyebrow="Hesap" backLabel="Hesap ayarları" title="Hesap sayfası">
        içerik
      </AccountFrameView>
      <AdminFrame title="Yönetim sayfası">içerik</AdminFrame>
    </>,
  );
  const account = screen.getByRole('link', { name: 'Hesap ayarları' });
  const admin = screen.getByRole('link', { name: messages.admin.back });
  expect(account).toHaveAttribute('href', '/hesap');
  expect(admin).toHaveAttribute('href', '/yonetim');
  for (const link of [account, admin]) {
    expect(link).toHaveClass('min-h-11', 'focus-visible:outline-2');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  }
});
