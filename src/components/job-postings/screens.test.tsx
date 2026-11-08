// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { JobPostingCard, JobPostingFormContext } from '@/contracts/job-postings';
import { PostingList } from './list';
import { PostingDetail } from './detail';
import { PostingEditor } from './editor';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const posting: JobPostingCard = {
  id: 'job-1',
  kind: 'INTERNSHIP',
  title: 'Yazılım stajyeri',
  organizationName: 'Örnek Kurum',
  companyId: null,
  location: 'İstanbul',
  isRemote: false,
  deadlineOn: '2027-02-05',
  daysLeft: 2,
  applyMethod: 'URL',
  publishedAt: new Date(),
  authorKind: 'ALUMNI',
  targetDepartments: [{ id: 'dep', name: 'YBS' }],
};
const options = {
  organizations: [{ key: 'Örnek Kurum', companyId: null, name: 'Örnek Kurum', count: 1 }],
  departments: [{ id: 'dep', name: 'YBS', count: 1 }],
  locations: [{ name: 'İstanbul', count: 1 }],
  remoteCount: 0,
};
const context: JobPostingFormContext = {
  authorDepartments: [{ id: 'dep', name: 'YBS' }],
  targetDepartments: [{ id: 'dep', name: 'YBS', facultyName: 'İşletme' }],
  limits: { maxDays: 60, submitLimit: 5, submitWindowDays: 30, maxTargets: 10 },
};
it('öğrenciye ilan verme sunulmaz; süzgeçler ve sonraki sayfa URL taşır', () => {
  renderUi(
    <PostingList
      canPost={false}
      filters={{ q: 'staj', location: 'İstanbul', organizationName: 'Örnek Kurum' }}
      options={options}
      page={{ items: [posting], total: 25, page: 1, pageSize: 20 }}
    />,
  );
  expect(screen.queryByRole('link', { name: 'İlan ver' })).not.toBeInTheDocument();
  expect(screen.getByRole('search')).toHaveAttribute('action', '/ilanlar');
  expect(screen.getByText(/doğrulanmış mezunlar/)).toBeVisible();
  expect(screen.getByRole('option', { name: 'Örnek Kurum' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Sonraki/ }).getAttribute('href')).toContain(
    'organizationName=',
  );
});
it('detayda yalnız güvenli dış bağlantı ve yazarın kimliği yoktur', () => {
  renderUi(
    <PostingDetail
      posting={{
        ...posting,
        description: 'Açıklama',
        applyUrl: 'https://example.org/basvur',
      }}
    />,
  );
  expect(screen.getByRole('link', { name: /Başvur/ })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(screen.queryByRole('link', { name: 'İletişim iste' })).not.toBeInTheDocument();
});
it('eksik form hatası özetlenir ve odaklanır, işlem çağrılmaz', async () => {
  const save = vi.fn(),
    submit = vi.fn();
  renderUi(<PostingEditor context={context} save={save} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  const message = await screen.findByText('Lütfen işaretli alanları kontrol et.');
  const alert = message.closest('[role=alert]');
  await waitFor(() => expect(alert).toHaveFocus());
  expect(alert).toHaveTextContent('Pozisyon adı');
  fireEvent.click(screen.getByRole('button', { name: 'Açıklama' }));
  await waitFor(() => expect(screen.getByLabelText(/Açıklama/)).toHaveFocus());
  expect(save).not.toHaveBeenCalled();
});
it('iletişim eylemi yazar kimliği taşımadan ilan üzerinden açılır', () => {
  renderUi(
    <PostingDetail
      canRequestContact
      posting={{
        ...posting,
        applyMethod: 'CONTACT_REQUEST',
        description: 'Açıklama',
        applyUrl: null,
      }}
    />,
  );
  const link = screen.getByRole('link', { name: 'İletişim iste' });
  expect(link).toHaveAttribute('href', '/ilanlar/job-1/iletisim');
  expect(document.body.innerHTML).not.toContain('gizli-yazar');
});
it('talep edilemeyen ilan için düğme yerine tek nötr açıklama gösterilir', () => {
  renderUi(
    <PostingDetail
      posting={{
        ...posting,
        applyMethod: 'CONTACT_REQUEST',
        description: 'Açıklama',
        applyUrl: null,
      }}
    />,
  );
  expect(screen.queryByRole('link', { name: 'İletişim iste' })).not.toBeInTheDocument();
  expect(screen.getByText('Bu ilan için şu anda iletişim talebi oluşturulamıyor.')).toBeVisible();
});
it('ilan iletişimi yalnız ilan kimliği ve seçilen alanlarla gönderilir', async () => {
  const { PostingContactForm } = await import('./contact');
  const send = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { requestId: 'istek', status: 'PENDING' } });
  renderUi(<PostingContactForm postingId="ilan-123" requestableFields={['EMAIL']} send={send} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({ jobPostingId: 'ilan-123', fields: ['EMAIL'], message: '' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Talebin gönderildi');
});
it('tamamlanmış ilan taslak olarak kaydedilir ve ardından incelemeye gönderilir', async () => {
  const { addDays, istanbulDay } = await import('./model');
  const save = vi.fn().mockResolvedValue({ ok: true, data: { id: 'draft-1' } });
  const submit = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { postingId: 'draft-1', status: 'PENDING' } });
  renderUi(<PostingEditor context={context} save={save} submit={submit} />);
  fireEvent.change(screen.getByLabelText(/Pozisyon adı/), {
    target: { value: 'Yazılım stajyeri' },
  });
  fireEvent.change(screen.getByLabelText(/Kurum adı/), { target: { value: 'Örnek Kurum' } });
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.change(screen.getByLabelText(/^Açıklama/), {
    target: { value: 'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.' },
  });
  fireEvent.change(screen.getByLabelText(/^Konum/), { target: { value: 'İstanbul' } });
  fireEvent.change(screen.getByLabelText(/Son başvuru tarihi/), {
    target: { value: addDays(istanbulDay(), 14) },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /YBS/ }));
  fireEvent.change(screen.getByLabelText(/HTTPS başvuru bağlantısı/), {
    target: { value: 'https://example.org/staj' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith({ postingId: 'draft-1' }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      departmentId: 'dep',
      content: expect.objectContaining({ title: 'Yazılım stajyeri', targetDepartmentIds: ['dep'] }),
    }),
  );
});
it('moderatör sözleşmedeki geçerli gerekçeyle ilanı reddeder', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const { PostingModeration } = await import('./manage');
  const review = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { postingId: 'job-1', status: 'REJECTED' } });
  const item = {
    id: 'job-1',
    status: 'PENDING' as const,
    kind: 'INTERNSHIP' as const,
    title: 'Staj',
    organizationName: 'Kurum',
    companyId: null,
    location: 'İstanbul',
    isRemote: false,
    description: 'Örnek açıklama',
    applyMethod: 'URL' as const,
    applyUrl: 'https://example.org',
    deadlineOn: '2027-01-01',
    departmentId: 'dep',
    targetDepartments: [{ id: 'dep', name: 'YBS' }],
    moderationNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: new Date(),
    publishedAt: null,
    endedAt: null,
    author: { displayName: 'Yetkili kişi', role: 'ALUMNI' as const },
  };
  renderUi(
    <PostingModeration
      initial={{ items: [item], nextCursor: null }}
      review={review}
      list={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
  fireEvent.change(screen.getByLabelText(/Ret gerekçesi/), { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  await waitFor(() =>
    expect(review).toHaveBeenCalledWith({ postingId: 'job-1', decision: 'REJECT', reason: 'abc' }),
  );
});
it('düzenlemede değiştirilmemiş sözlük kurumu korunur', async () => {
  const initial = {
    id: 'job-1',
    status: 'DRAFT' as const,
    kind: 'INTERNSHIP' as const,
    title: 'Staj',
    organizationName: 'Kurum',
    companyId: 'company-1',
    location: 'İstanbul',
    isRemote: false,
    description: null,
    applyMethod: null,
    applyUrl: null,
    deadlineOn: null,
    departmentId: 'dep',
    targetDepartments: [],
    moderationNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: null,
    publishedAt: null,
    endedAt: null,
  };
  const save = vi.fn().mockResolvedValue({ ok: true, data: initial });
  renderUi(<PostingEditor context={context} initial={initial} save={save} submit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ companyId: 'company-1' }) }),
    ),
  );
});
it('ağ hatasında ham hata metni gösterilmez, kullanıcıya kararlı hata sunulur', async () => {
  const { PostingContactForm } = await import('./contact');
  renderUi(
    <PostingContactForm
      postingId="ilan-123"
      requestableFields={['EMAIL']}
      send={vi.fn().mockRejectedValue(new Error('gizli ağ ayrıntısı'))}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(document.body.textContent).not.toContain('gizli ağ ayrıntısı');
});
