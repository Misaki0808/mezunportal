// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { MembershipForm } from './membership-form';

const departments = [
  {
    id: 'dept',
    name: 'Yönetim Bilişim Sistemleri',
    facultyName: 'İktisat',
    universityName: 'İstanbul Üniversitesi',
  },
];
it('hatalı alanlara özgü yardım gösterir ve ilk alana odaklanır', async () => {
  const { user } = renderUi(
    <MembershipForm role="STUDENT" departments={departments} submit={vi.fn()} />,
  );
  await user.click(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
  expect(screen.getByText('Devam etmek için bölümünü seç.')).toBeVisible();
  expect(screen.getByLabelText(/Bölüm/)).toHaveFocus();
  expect(screen.getByText(/Giriş yılını 1990 ile/)).toBeVisible();
  expect(
    screen.getByRole('option', { name: /Yönetim Bilişim Sistemleri · İktisat/ }),
  ).toBeInTheDocument();
});
it('başarılı işlemden sonra başlık güncellenir', async () => {
  const { user } = renderUi(
    <MembershipForm
      role="STUDENT"
      departments={departments}
      submit={vi
        .fn()
        .mockResolvedValue({ ok: true, data: { membershipId: 'x', status: 'VERIFIED' } })}
    />,
  );
  await user.selectOptions(screen.getByLabelText(/Bölüm/), 'dept');
  await user.type(screen.getByLabelText(/Üniversiteye giriş yılı/), '2024');
  await user.click(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
  expect(await screen.findByRole('heading', { name: 'Doğrulama tamamlandı' })).toBeVisible();
  // Tek eylem sıradaki adıma gider (durum sayfası araya girmez).
  expect(screen.getByRole('link', { name: 'Başlangıç adımlarına geç' })).toHaveAttribute(
    'href',
    '/baslangic',
  );
  expect(screen.queryByRole('link', { name: 'Durumu gör' })).not.toBeInTheDocument();
});
