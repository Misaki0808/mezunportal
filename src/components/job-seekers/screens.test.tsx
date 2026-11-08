// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
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
it('iletişim için en az bir alan istenir, sunucu kapalı alanı seçtirmez', async () => {
  renderUi(
    <SeekerContact
      candidateRef="opaque"
      preview={{ canRequest: true, card: initial.preview!, requestableFields: ['EMAIL'] }}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'Telefon' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'İstek gönder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('En az bir');
  expect(mocks.request).not.toHaveBeenCalled();
});
