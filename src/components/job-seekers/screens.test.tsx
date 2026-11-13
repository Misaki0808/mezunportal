// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderUi, renderWithToasts } from '@/test/render';
import type { SeekerSettings } from '@/contracts/job-seekers';
const mocks = vi.hoisted(() => ({
  consent: vi.fn(),
  save: vi.fn(),
  declaration: vi.fn(),
  search: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@/server/actions/privacy', () => ({ recordConsents: mocks.consent }));
vi.mock('@/server/actions/job-seekers', () => ({
  setSeekerSettings: mocks.save,
  setHiringDeclaration: mocks.declaration,
  searchSeekers: mocks.search,
  requestSeekerContact: mocks.request,
}));
import { SeekerSettingsScreen } from './settings';
import { SeekerSearch } from './search';
import { SeekerContact } from './contact';
const initial: SeekerSettings = {
  seekingInternship: false,
  termYear: null,
  termSeason: null,
  consent: { granted: false, currentVersion: 'taslak-1', needsAction: false },
  visible: false,
  viewCount: 2,
  preview: {
    departmentId: 'dept',
    departmentName: 'YBS',
    classStanding: { kind: 'GRADE', grade: 2, extended: false },
    headline: 'Veri meraklısı',
    tags: [{ kind: 'INTEREST', slug: 'software' }],
    termYear: null,
    termSeason: null,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consent.mockResolvedValue({ ok: true, data: {} });
  mocks.save.mockResolvedValue({
    ok: true,
    data: {
      ...initial,
      seekingInternship: true,
      visible: true,
      consent: { ...initial.consent, granted: true },
    },
  });
});
it('önizleme ve sayaç görünür; açık rıza olmadan görünürlük açılmaz', async () => {
  renderUi(<SeekerSettingsScreen initial={initial} />);
  expect(screen.getByText('Mezunlar seni böyle görür')).toBeVisible();
  expect(screen.getByText('Yazılım geliştirme')).toBeVisible();
  expect(screen.getByText('Kartın 2 kez gösterildi.')).toBeVisible();
  fireEvent.click(screen.getByRole('switch', { name: /İş arayanlara görün/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('açık rıza');
  expect(mocks.consent).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Metni okudum/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      seekingInternship: true,
      termYear: null,
      termSeason: null,
    }),
  );
  expect(mocks.consent).toHaveBeenCalledWith({
    decisions: [{ documentType: 'JOB_SEEKER_VISIBILITY', version: 'taslak-1', granted: true }],
  });
});
it('mezun beyan vermeden arama eylemi sunulmaz', () => {
  renderUi(
    <SeekerSearch initial={{ hiring: false, declaredAt: null }} departments={[]} tags={[]} />,
  );
  expect(screen.getByText('Aday aramak için işe alım yaptığını beyan et.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Aday ara' })).not.toBeInTheDocument();
});
it('rıza onay kutusu kit onay kutusudur (24 px, tüm satır tıklanır, 44 px hedef)', () => {
  renderUi(<SeekerSettingsScreen initial={initial} />);
  fireEvent.click(screen.getByRole('switch', { name: /İş arayanlara görün/ }));

  const consent = screen.getByRole('checkbox', { name: /Metni okudum/ });
  expect(consent).toHaveClass('appearance-none', 'size-6');
  expect(consent.closest('label')).toHaveClass('min-h-11');
  expect(consent).not.toBeChecked();
  fireEvent.click(screen.getByText(/Metni okudum/));
  expect(consent).toBeChecked();
});
it('iletişim alanları kit onay kutusudur: dörtü de 44 px hedefli, kapalı alan devre dışı', () => {
  renderWithToasts(
    <SeekerContact
      candidateRef="opaque"
      preview={{ canRequest: true, card: initial.preview!, requestableFields: ['EMAIL'] }}
    />,
  );

  const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes).toHaveLength(4);
  for (const box of boxes) {
    expect(box).toHaveClass('appearance-none', 'size-6');
    expect(box.closest('label')).toHaveClass('min-h-11');
  }
  expect(screen.getByRole('checkbox', { name: 'E-posta' })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: 'Telefon' })).toBeDisabled();
});
it('iletişim için en az bir alan istenir, sunucu kapalı alanı seçtirmez', async () => {
  renderWithToasts(
    <SeekerContact
      candidateRef="opaque"
      preview={{ canRequest: true, card: initial.preview!, requestableFields: ['EMAIL'] }}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'Telefon' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'İstek gönder' }));
  expect(await screen.findByText(/En az bir/)).toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
});
it('iletişim isteği beklerken onay kutuları kilitlidir, sonuçtan sonra açılır', async () => {
  const { act } = await import('@testing-library/react');
  const gate = Promise.withResolvers<{ ok: false; errorCode: string }>();
  mocks.request.mockReturnValueOnce(gate.promise);
  renderWithToasts(
    <SeekerContact
      candidateRef="opaque"
      preview={{ canRequest: true, card: initial.preview!, requestableFields: ['EMAIL'] }}
    />,
  );
  const email = screen.getByRole('checkbox', { name: 'E-posta' });
  fireEvent.click(email);
  expect(email).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'İstek gönder' }));
  // İstek giderken seçim değiştirilemez (gönderilen alanlar ekrandakiyle ayrışmasın).
  expect(email).toBeDisabled();
  expect(email).toBeChecked();

  await act(async () => gate.resolve({ ok: false, errorCode: 'SERVER_UNEXPECTED' }));
  await waitFor(() => expect(email).toBeEnabled());
  // Kapalı alan bekleme bittikten sonra da kilitli kalır (kilit yalnız sunucu iznine bağlı).
  expect(screen.getByRole('checkbox', { name: 'Telefon' })).toBeDisabled();
});
it('aday iletişiminde çift tıklama tek istek ve ağ hatasında not korunur', async () => {
  const { act } = await import('@testing-library/react');
  const gate = Promise.withResolvers<never>();
  mocks.request.mockReturnValueOnce(gate.promise);
  renderWithToasts(
    <SeekerContact
      candidateRef="opaque"
      preview={{ canRequest: true, card: initial.preview!, requestableFields: ['EMAIL'] }}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  const note = screen.getByLabelText(/Kısa not/);
  fireEvent.change(note, { target: { value: 'Merhaba' } });
  const button = screen.getByRole('button', { name: 'İstek gönder' });
  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-busy', 'true');
  await act(async () => gate.reject(new Error('ağ')));
  expect(note).toHaveValue('Merhaba');
  expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
});
