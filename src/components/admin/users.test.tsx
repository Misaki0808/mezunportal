// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AdminUserDetail as Detail } from '@/contracts/admin-users';
import { renderUi } from '@/test/render';
import { AdminUserDetail } from './user-detail';
import { AdminUsers } from './users';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
const detail: Detail = {
  id: 'u1',
  displayName: 'Örnek Üye',
  maskedEmail: 'o***@o***.iu.edu.tr',
  maskedPhone: '*** *** ** 67',
  status: 'ACTIVE',
  isAdmin: false,
  mentorActive: false,
  manageable: true,
  createdAt: new Date('2026-01-01'),
  suspension: { suspended: false, reason: null, expiresAt: null },
  memberships: [
    {
      id: 'm1',
      departmentId: 'd1',
      departmentName: 'YBS',
      role: 'STUDENT',
      verificationStatus: 'VERIFIED',
      active: true,
      entryYear: 2023,
      graduationYear: null,
      inScope: true,
    },
  ],
};
const departments = [{ id: 'd1', name: 'YBS', facultyId: 'f1', facultyName: 'Fakülte' }];
describe('yönetimde kullanıcılar', () => {
  it('yalnız maskeli iletişim alanlarını gösterir ve kapsam dışı yönetim eylemi sunmaz', () => {
    renderUi(
      <AdminUserDetail
        initial={{ ...detail, manageable: false }}
        departments={departments}
        suspend={vi.fn()}
        unsuspend={vi.fn()}
        correct={vi.fn()}
      />,
    );
    expect(screen.getByText('o***@o***.iu.edu.tr')).toBeVisible();
    expect(screen.getByText('*** *** ** 67')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Hesabı askıya al' })).not.toBeInTheDocument();
    expect(screen.getByText('Bu hesap üzerinde işlem yetkin yok.')).toBeVisible();
  });
  it('askıya alma açık onay ve geçerli gerekçe olmadan sunucuya gitmez', async () => {
    const suspend = vi.fn().mockResolvedValue({
      ok: true,
      data: { userId: 'u1', status: 'SUSPENDED', expiresAt: null, sessionsRevoked: 1 },
    });
    const { user } = renderUi(
      <AdminUserDetail
        initial={detail}
        departments={departments}
        suspend={suspend}
        unsuspend={vi.fn()}
        correct={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Hesabı askıya al' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    expect(suspend).not.toHaveBeenCalled();
    expect(within(dialog).getByText('En az 3 karakterlik bir gerekçe yaz.')).toBeVisible();
    await user.type(within(dialog).getByLabelText(/İşlem gerekçesi/), 'Güvenlik incelemesi');
    await user.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    expect(suspend).toHaveBeenCalledWith({
      userId: 'u1',
      reason: 'Güvenlik incelemesi',
      confirmed: true,
    });
  });
  it('"Ayrıntıyı aç" bağlantıları hedef kullanıcıyı adıyla ayırt eder (kart ve tablo görünümü)', () => {
    const second = { ...detail, id: 'u2', displayName: 'Başka Üye' };
    renderUi(
      <AdminUsers initial={{ items: [detail, second], nextCursor: null }} search={vi.fn()} />,
    );
    for (const [name, id] of [
      ['Örnek Üye', 'u1'],
      ['Başka Üye', 'u2'],
    ] as const) {
      const links = screen.getAllByRole('link', { name: `Ayrıntıyı aç: ${name}` });
      expect(links.length).toBe(2); // kart + tablo (biri CSS ile gizli)
      for (const link of links) expect(link).toHaveAttribute('href', `/yonetim/kullanicilar/${id}`);
    }
    // Görünür metin adın başında korunur (etikette görünür metin geçer).
    expect(screen.getAllByText('Ayrıntıyı aç').length).toBe(4);
  });

  it('çok kısa aramayı göndermeden alan yanında bildirir', async () => {
    const search = vi.fn();
    const { user } = renderUi(
      <AdminUsers initial={{ items: [detail], nextCursor: null }} search={search} />,
    );
    await user.type(screen.getByLabelText('Ad veya e-posta ile ara'), 'a');
    await user.click(screen.getByRole('button', { name: 'Ara' }));
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText('En az 2 karakter gir veya alanı boş bırak.')).toBeVisible();
  });
});
