// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import messages from '../../../messages/tr.json';
import { renderUi, renderWithToasts } from '@/test/render';
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
  availableTags: [],
  targetDepartments: [{ id: 'dep', name: 'YBS', facultyName: 'İşletme' }],
  limits: { maxDays: 60, submitLimit: 5, submitWindowDays: 30, maxTargets: 10 },
};
it('"İncele" bağlantıları ilan başlığıyla adlanır; görünen metin aynı kalır', () => {
  const other: JobPostingCard = { ...posting, id: 'job-2', title: 'Veri analizi stajyeri' };
  renderUi(
    <PostingList
      canPost={false}
      filters={{}}
      options={options}
      page={{ items: [posting, other], total: 2, page: 1, pageSize: 20 }}
    />,
  );
  const first = screen.getByRole('link', { name: 'İncele: Yazılım stajyeri' });
  const second = screen.getByRole('link', { name: 'İncele: Veri analizi stajyeri' });
  expect(first).toHaveAttribute('href', '/ilanlar/job-1');
  expect(second).toHaveAttribute('href', '/ilanlar/job-2');
  expect(first).toHaveTextContent(/^İncele/);
});
it('öğrenciye ilan verme sunulmaz; süzgeçler ve sonraki sayfa URL taşır', () => {
  renderWithToasts(
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
  renderWithToasts(
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
  renderWithToasts(<PostingEditor context={context} save={save} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  const message = await screen.findByText('İşaretli alanları kontrol et.');
  const alert = message.closest('[role=alert]');
  await waitFor(() => expect(alert).toHaveFocus());
  expect(alert).toHaveTextContent('Pozisyon adı');
  fireEvent.click(screen.getByRole('button', { name: 'Açıklama' }));
  await waitFor(() => expect(screen.getByLabelText(/Açıklama/)).toHaveFocus());
  expect(save).not.toHaveBeenCalled();
});
it('iletişim eylemi yazar kimliği taşımadan ilan üzerinden açılır', () => {
  renderWithToasts(
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
  renderWithToasts(
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
  renderWithToasts(
    <PostingContactForm postingId="ilan-123" requestableFields={['EMAIL']} send={send} />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({ jobPostingId: 'ilan-123', fields: ['EMAIL'], message: '' }),
  );
  expect((await screen.findAllByText(/Talebin gönderildi/)).length).toBeGreaterThan(0);
});
it('ilan iletişiminde çift gönderim tek istektir ve hata notu korur', async () => {
  const { PostingContactForm } = await import('./contact');
  const gate = Promise.withResolvers<{
    ok: true;
    data: { requestId: string; status: 'PENDING' };
  }>();
  const send = vi.fn(() => gate.promise);
  renderWithToasts(<PostingContactForm postingId="p" requestableFields={['EMAIL']} send={send} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  const note = screen.getByLabelText(/Kısa not/);
  fireEvent.change(note, { target: { value: 'Notum' } });
  const button = screen.getByRole('button', { name: 'Talep gönder' });
  fireEvent.submit(button.closest('form')!);
  fireEvent.submit(button.closest('form')!);
  expect(send).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-busy', 'true');
  await act(async () => gate.reject(new Error('ağ')));
  expect(note).toHaveValue('Notum');
  expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
});
it('tamamlanmış ilan taslak olarak kaydedilir ve ardından incelemeye gönderilir', async () => {
  const { addDays, istanbulDay } = await import('./model');
  const gate = Promise.withResolvers<never>();
  const save = vi
    .fn()
    .mockReturnValueOnce(gate.promise)
    .mockResolvedValue({ ok: true, data: { id: 'draft-1' } });
  const submit = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { postingId: 'draft-1', status: 'PENDING' } });
  renderWithToasts(<PostingEditor context={context} save={save} submit={submit} />);
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
  const button = screen.getByRole('button', { name: 'İncelemeye gönder' });
  act(() => {
    button.click();
    button.click();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-busy', 'true');
  await act(async () => gate.reject(new Error('ağ')));
  expect(screen.getByText('Yazılım stajyeri')).toBeVisible();
  expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
  fireEvent.click(button);
  await waitFor(() => expect(submit).toHaveBeenCalledWith({ postingId: 'draft-1' }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      departmentId: 'dep',
      content: expect.objectContaining({ title: 'Yazılım stajyeri', targetDepartmentIds: ['dep'] }),
    }),
  );
});
const pendingItem = {
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
  tagIds: [],
  targetGrades: [],
  moderationNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  submittedAt: new Date(),
  publishedAt: null,
  endedAt: null,
  author: { displayName: 'Yetkili kişi', role: 'ALUMNI' as const },
};
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
  renderWithToasts(
    <PostingModeration
      initial={{ items: [pendingItem], nextCursor: null }}
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
it('moderasyon onay penceresi ne olacağını söyler: yayımlamada bildirim, reddetmede gerekçenin gösterilmesi', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const { PostingModeration } = await import('./manage');
  renderWithToasts(
    <PostingModeration
      initial={{ items: [pendingItem], nextCursor: null }}
      review={vi.fn()}
      list={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Yayımla' }));
  const publish = screen.getByRole('dialog');
  expect(
    within(publish).getByText('İlan yayımlanır ve paylaşan kişiye bildirim gider.'),
  ).toBeVisible();
  fireEvent.click(within(publish).getByRole('button', { name: 'Vazgeç' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
  const reject = screen.getByRole('dialog');
  expect(
    within(reject).getByText('Yazdığın gerekçe ilanı paylaşan kişiye gösterilir.'),
  ).toBeVisible();
  expect(within(reject).queryByText(/bildirim gider/)).toBeNull();
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
    tagIds: [],
    targetGrades: [],
    moderationNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: null,
    publishedAt: null,
    endedAt: null,
  };
  const save = vi.fn().mockResolvedValue({ ok: true, data: initial });
  renderWithToasts(
    <PostingEditor context={context} initial={initial} save={save} submit={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ companyId: 'company-1' }) }),
    ),
  );
});
it('ağ hatasında ham hata metni gösterilmez, kullanıcıya kararlı hata sunulur', async () => {
  const { PostingContactForm } = await import('./contact');
  renderWithToasts(
    <PostingContactForm
      postingId="ilan-123"
      requestableFields={['EMAIL']}
      send={vi.fn().mockRejectedValue(new Error('gizli ağ ayrıntısı'))}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
  expect(await screen.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
  expect(document.body.textContent).not.toContain('gizli ağ ayrıntısı');
});

it.each(['http://example.org/staj', 'javascript:alert(1)', 'data:text/html,example'])(
  'okuyucuya güvenli olmayan %s başvuru bağlantısı sunulmaz',
  (applyUrl) => {
    renderWithToasts(<PostingDetail posting={{ ...posting, description: 'Açıklama', applyUrl }} />);
    expect(screen.queryByRole('link', { name: /Başvur/ })).not.toBeInTheDocument();
  },
);
it('60 gün sınırındaki taslak kaydedilir, 61. gün istemcide reddedilir', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
  try {
    const { addDays, istanbulDay } = await import('./model');
    const save = vi.fn().mockResolvedValue({ ok: true, data: { id: 'date-boundary' } });
    renderWithToasts(<PostingEditor context={context} save={save} submit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    const date = screen.getByLabelText(/Son başvuru tarihi/);
    expect(date).toHaveAttribute('max', addDays(istanbulDay(), 60));
    fireEvent.change(date, { target: { value: addDays(istanbulDay(), 61) } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    expect(
      await screen.findByText('Bugünden başlayarak en fazla 60 gün sonrası seçilebilir.'),
    ).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(date, { target: { value: addDays(istanbulDay(), 60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  } finally {
    vi.useRealTimers();
  }
});
it('mobil süzgeçler alt sayfada uygulanır ve arama metni korunur', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  renderWithToasts(
    <PostingList
      canPost={false}
      filters={{ q: 'tasarım' }}
      options={options}
      page={{ items: [posting], total: 1, page: 1, pageSize: 20 }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Süzgeçler' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Konum');
  for (const label of ['Kurum', 'Konum', 'Hedef bölüm', 'İlan türü', 'Kalan süre']) {
    expect(within(dialog).getByLabelText(label, { exact: true })).toHaveProperty(
      'tagName',
      'SELECT',
    );
  }
  const apply = screen.getByRole('button', { name: 'Süzgeçleri uygula' });
  const form = document.getElementById(apply.getAttribute('form')!);
  expect(form).toHaveAttribute('action', '/ilanlar');
  expect(new FormData(form as HTMLFormElement).get('q')).toBe('tasarım');
});
