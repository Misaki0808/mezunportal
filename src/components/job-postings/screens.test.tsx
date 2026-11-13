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
const emptyPage = { items: [], total: 0, page: 1, pageSize: 20 };
it('ilan yokken öğrenci: sıfır sayaç yok, ilanları kimin paylaştığı ve tek eylem (profil) yazılır', () => {
  renderWithToasts(<PostingList canPost={false} filters={{}} options={options} page={emptyPage} />);
  expect(screen.getByText('Henüz ilan paylaşılmadı')).toBeVisible();
  expect(screen.getByText(/İlgi alanlarını eklersen, ilan çıktıkça sana uyanlar/)).toBeVisible();
  expect(screen.queryByText('0 ilan')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'İlan ver' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Profilini düzenle' })).toHaveAttribute(
    'href',
    '/profil',
  );
});
it('ilan yokken ilan verebilen rol: öğrenciye söylenen metin değil, ilk ilanı sen paylaş', () => {
  renderWithToasts(<PostingList canPost filters={{}} options={options} page={emptyPage} />);
  expect(screen.getByText(/ilk ilanı sen paylaşabilirsin/)).toBeVisible();
  // Boşken tek "İlan ver": başlıktaki gizlenir, boş durumun düğmesi kalır ("İlanlarım" başka eylemdir).
  const post = screen.getAllByRole('link', { name: 'İlan ver' });
  expect(post).toHaveLength(1);
  expect(post[0]!.closest('header')).toBeNull();
  expect(screen.getByRole('link', { name: 'İlanlarım' })).toBeVisible();
  expect(screen.queryByText(/ilgi alanlarını eklersen/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Profilini düzenle' })).not.toBeInTheDocument();
  expect(screen.queryByText('0 ilan')).not.toBeInTheDocument();
});
it('ilan varken ilan veren rolde "İlan ver" başlıkta kalır (bugünkü düzen)', () => {
  renderWithToasts(
    <PostingList
      canPost
      filters={{}}
      options={options}
      page={{ items: [posting], total: 1, page: 1, pageSize: 20 }}
    />,
  );
  const post = screen.getAllByRole('link', { name: 'İlan ver' });
  expect(post).toHaveLength(1);
  expect(post[0]!.closest('header')).not.toBeNull();
});
it('filtreyle ilan bulunamayınca sayaç ve temizleme kalır, "henüz paylaşılmadı" denmez', () => {
  renderWithToasts(
    <PostingList canPost={false} filters={{ q: 'staj' }} options={options} page={emptyPage} />,
  );
  expect(screen.getByText('0 ilan')).toBeVisible();
  expect(screen.getByText('Henüz ilan bulunamadı')).toBeVisible();
  expect(screen.queryByText('Henüz ilan paylaşılmadı')).not.toBeInTheDocument();
  expect(screen.getByText('Filtreleri değiştirerek yeniden deneyebilirsin.')).toBeVisible();
});
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
it('her adım yalnız kendi alanlarını doğrular, odak ve girilen değerler korunur', async () => {
  const save = vi.fn(),
    submit = vi.fn();
  const { addDays, istanbulDay } = await import('./model');
  renderWithToasts(<PostingEditor context={context} save={save} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const title = screen.getByLabelText(/Pozisyon adı/);
  await waitFor(() => expect(title).toHaveFocus());
  expect(title).toHaveAttribute('aria-invalid', 'true');
  expect(title).toHaveAttribute('aria-describedby');
  expect(document.getElementById(title.getAttribute('aria-describedby')!)).toHaveTextContent(
    'Bu alanı kontrol et.',
  );
  expect(screen.getByRole('heading', { name: /İlanı anlat$/ })).toBeVisible();
  fireEvent.change(title, { target: { value: 'Yazılım stajyeri' } });
  fireEvent.change(screen.getByLabelText(/Kurum adı/), { target: { value: 'Örnek Kurum' } });
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const details = screen.getByRole('heading', { name: /Ayrıntılar ve başvuru$/ });
  await waitFor(() => expect(details).toHaveFocus());
  expect(details).toHaveAccessibleName('Adım 2 / 3: Ayrıntılar ve başvuru');
  expect(details).toHaveAttribute('tabindex', '-1');
  expect(screen.getByText('Adım 2 / 3: Ayrıntılar ve başvuru')).not.toHaveAttribute('aria-current');
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const description = screen.getByLabelText(/^Açıklama/);
  await waitFor(() => expect(description).toHaveFocus());
  expect(details).not.toHaveAttribute('tabindex');
  expect(description).toHaveAttribute('aria-invalid', 'true');
  expect(description).toHaveAttribute('aria-describedby');
  fireEvent.change(description, {
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
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /İlan önizlemesi$/ })).toHaveFocus(),
  );
  const newFocus = vi.fn();
  screen.getByRole('heading', { name: /İlan önizlemesi$/ }).addEventListener('focus', newFocus);
  fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Ayrıntılar ve başvuru$/ })).toHaveFocus(),
  );
  await waitFor(() => expect(newFocus).toHaveBeenCalled());
  expect(screen.getByLabelText(/^Açıklama/)).toHaveValue(
    'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /İlanı anlat$/ })).toHaveFocus());
  expect(screen.getByLabelText(/Pozisyon adı/)).toHaveValue('Yazılım stajyeri');
  expect(save).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
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
it.each([
  ['title', /Pozisyon adı/],
  ['kind', /İlan türü/],
  ['companyId', /Kurum adı/],
  ['isRemote', /Uzaktan çalışılabilir/],
  ['tagIds', /İlan etiketleri/],
  ['targetGrades', /Hedef sınıflar/],
  ['applyMethod', /Başvuru yolu/],
])('son adımda sunucunun %s alan hatası doğru alana götürür', async (field, label) => {
  const { addDays, istanbulDay } = await import('./model');
  const save = vi.fn().mockResolvedValue({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
    fieldErrors: { [`content.${field}`]: 'VALIDATION_INVALID' },
  });
  const initial = {
    ...pendingItem,
    title: 'Yazılım stajyeri',
    description: 'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
    deadlineOn: addDays(istanbulDay(), 14),
  };
  renderWithToasts(
    <PostingEditor context={context} initial={initial} save={save} submit={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  const control =
    field === 'tagIds' || field === 'targetGrades'
      ? await screen.findByRole('group', { name: label })
      : await screen.findByLabelText(label);
  await waitFor(() => expect(control).toHaveFocus());
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby');
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
    fireEvent.change(screen.getByLabelText(/Pozisyon adı/), { target: { value: 'Staj' } });
    fireEvent.change(screen.getByLabelText(/Kurum adı/), { target: { value: 'Kurum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    const date = screen.getByLabelText(/Son başvuru tarihi/);
    expect(date).toHaveAttribute('max', addDays(istanbulDay(), 60));
    fireEvent.change(date, { target: { value: addDays(istanbulDay(), 61) } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    expect(
      (await screen.findAllByText('Bugünden başlayarak en fazla 60 gün sonrası seçilebilir.'))[0],
    ).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(date, { target: { value: addDays(istanbulDay(), 60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  } finally {
    vi.useRealTimers();
  }
});
it('ilan araması ortak SearchBar: ipucu açıklama olarak okunur; Ara ve Filtreler aynı satırda, filtre alanları aynı formda', () => {
  renderWithToasts(
    <PostingList
      canPost={false}
      filters={{}}
      options={options}
      page={{ items: [posting], total: 1, page: 1, pageSize: 20 }}
    />,
  );

  const box = screen.getByRole('searchbox', { name: 'Pozisyon veya kurum ara' });
  expect(box).toHaveAccessibleDescription('İlan ara');
  expect(box.parentElement).toBe(screen.getByRole('button', { name: 'Ara' }).parentElement);
  expect(box.parentElement).toBe(screen.getByRole('button', { name: 'Filtreler' }).parentElement);
  expect(box.closest('form')).toContainElement(
    screen.getByText('Filtreler', { selector: 'summary' }),
  );
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
  fireEvent.click(screen.getByRole('button', { name: 'Filtreler' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Konum');
  for (const label of ['Kurum', 'Konum', 'Hedef bölüm', 'İlan türü', 'Kalan süre']) {
    expect(within(dialog).getByLabelText(label, { exact: true })).toHaveProperty(
      'tagName',
      'SELECT',
    );
  }
  const apply = screen.getByRole('button', { name: 'Filtreleri uygula' });
  const form = document.getElementById(apply.getAttribute('form')!);
  expect(form).toHaveAttribute('action', '/ilanlar');
  expect(new FormData(form as HTMLFormElement).get('q')).toBe('tasarım');
});

it.each(['PUBLISH', 'REJECT'] as const)(
  'B2: %s kararı odağı sonraki ilana, son kararda başlığa taşır',
  async (decision) => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    const { PostingModeration } = await import('./manage');
    const review = vi.fn().mockResolvedValue({
      ok: true,
      data: { postingId: 'job-1', status: decision === 'PUBLISH' ? 'PUBLISHED' : 'REJECTED' },
    });
    const { user } = renderWithToasts(
      <PostingModeration
        initial={{
          items: [pendingItem, { ...pendingItem, id: 'job-2', title: 'İkinci ilan' }],
          nextCursor: null,
        }}
        review={review}
        list={vi.fn()}
      />,
    );
    const action = decision === 'PUBLISH' ? 'Yayımla' : 'Reddet';
    await user.click(screen.getAllByRole('button', { name: action })[0]!);
    if (decision === 'REJECT')
      await user.type(screen.getByLabelText(/Ret gerekçesi/), 'Geçerli ret gerekçesi');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yayımla' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Yayımla' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: messages.jobs.moderationTitle })).toHaveFocus(),
    );
  },
);

it('B3: boş ret ilk hatalı alana odaklanır ve alan altı açıklama taşır', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const { PostingModeration } = await import('./manage');
  const review = vi.fn();
  const { user } = renderWithToasts(
    <PostingModeration
      initial={{ items: [pendingItem], nextCursor: null }}
      review={review}
      list={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Reddet' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
  const reason = screen.getByLabelText(/Ret gerekçesi/);
  expect(reason).toHaveFocus();
  expect(reason).toHaveAttribute('aria-invalid', 'true');
  expect(reason).toHaveAccessibleDescription(/En az 3 karakterlik bir gerekçe yaz/);
  expect(review).not.toHaveBeenCalled();
});

it('tek adım duyurusu ve odaktaki alan açıklaması kullanılır; fieldset odağı geçicidir', async () => {
  renderWithToasts(<PostingEditor context={context} save={vi.fn()} submit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const title = screen.getByLabelText(/Pozisyon adı/);
  await waitFor(() => expect(title).toHaveFocus());
  expect(title).toHaveAccessibleDescription('Bu alanı kontrol et.');
  const message = document.getElementById(title.getAttribute('aria-describedby')!)!;
  expect(message.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(document.querySelectorAll('[data-hydrated] [role=alert]')).toHaveLength(0);
  fireEvent.change(title, { target: { value: 'Yazılım stajyeri' } });
  fireEvent.change(screen.getByLabelText(/Kurum adı/), { target: { value: 'Kurum' } });
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const heading = screen.getByRole('heading', { name: 'Adım 2 / 3: Ayrıntılar ve başvuru' });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(
    screen.getByText('Adım 2 / 3: Ayrıntılar ve başvuru').closest('[aria-hidden]'),
  ).toHaveAttribute('aria-hidden', 'true');
  expect(document.querySelectorAll('fieldset[tabindex]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  const summary = screen.getByText(messages.jobs.formSummary).parentElement!;
  const targetLink = within(summary).getByRole('button', { name: 'Hedef bölümler' });
  fireEvent.click(targetLink);
  const target = screen.getByRole('group', { name: /Hedef bölümler/ });
  await waitFor(() => expect(target).toHaveFocus());
  expect(target).toHaveAttribute('tabindex', '-1');
  expect(target).toHaveAccessibleDescription('Bu alanı kontrol et.');
  screen.getByLabelText(/^Açıklama/).focus();
  expect(target).not.toHaveAttribute('tabindex');
  expect(document.querySelectorAll('[data-hydrated] [role=alert]')).toHaveLength(0);
});

it.each([
  ['JOB_POSTING_DEADLINE_INVALID', /Son başvuru tarihi/],
  ['JOB_POSTING_TARGET_INVALID', /Hedef bölümler/],
  ['JOB_POSTING_URL_INVALID', /HTTPS başvuru bağlantısı/],
] as const)('alan verilmeyen %s sunucu hatası ilgili alana götürür', async (code, label) => {
  const { addDays, istanbulDay } = await import('./model');
  const initial = {
    ...pendingItem,
    title: 'Yazılım stajyeri',
    description: 'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
    deadlineOn: addDays(istanbulDay(), 14),
  };
  const save = vi.fn().mockResolvedValue({ ok: true, data: initial });
  const submit = vi.fn().mockResolvedValue({ ok: false, errorCode: code });
  renderWithToasts(
    <PostingEditor context={context} initial={initial} save={save} submit={submit} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  const target =
    code === 'JOB_POSTING_TARGET_INVALID'
      ? await screen.findByRole('group', { name: label })
      : await screen.findByLabelText(label);
  await waitFor(() => expect(target).toHaveFocus());
  expect(target).toHaveAttribute('aria-invalid', 'true');
  expect(target).toHaveAccessibleDescription(expect.stringContaining(messages.errors.codes[code]));
});

it('sunucu hatası özetindeki başka adım bağlantısı o alanı açar ve odaklar', async () => {
  const { addDays, istanbulDay } = await import('./model');
  const initial = {
    ...pendingItem,
    title: 'Yazılım stajyeri',
    description: 'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
    deadlineOn: addDays(istanbulDay(), 14),
  };
  const save = vi.fn().mockResolvedValue({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
    fieldErrors: {
      'content.title': 'VALIDATION_INVALID',
      'content.description': 'VALIDATION_INVALID',
    },
  });
  renderWithToasts(
    <PostingEditor context={context} initial={initial} save={save} submit={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  await waitFor(() => expect(screen.getByLabelText(/Pozisyon adı/)).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: /^Açıklama$/ }));
  await waitFor(() => expect(screen.getByLabelText(/^Açıklama/)).toHaveFocus());
});

it('alanı bilinmeyen sunucu hatası özette kalır ve odağı alır', async () => {
  const save = vi.fn().mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  renderWithToasts(<PostingEditor context={context} save={save} submit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
  const summary = (await screen.findByText(messages.errors.codes.SERVER_UNEXPECTED)).parentElement!;
  await waitFor(() => expect(summary).toHaveFocus());
  expect(summary.querySelectorAll('button')).toHaveLength(0);
  expect(summary).toHaveAttribute('tabindex', '-1');
  screen.getByRole('button', { name: 'Taslağı kaydet' }).focus();
  expect(summary).not.toHaveAttribute('tabindex');
});

it('kit onay kutuları etiket ve klavyeyle değişir; taslak değerleri ve sınır korunur', async () => {
  const tags = Array.from({ length: 6 }, (_, i) => ({
    id: `tag-${i}`,
    slug: `custom-${i}`,
    label: `Etiket ${i}`,
  }));
  const save = vi.fn().mockResolvedValue({ ok: true, data: { id: 'draft-1' } });
  const { user } = renderWithToasts(
    <PostingEditor context={{ ...context, availableTags: tags }} save={save} submit={vi.fn()} />,
  );
  await user.type(screen.getByLabelText(/Pozisyon adı/), 'Yazılım stajyeri');
  await user.type(screen.getByLabelText(/Kurum adı/), 'Örnek Kurum');
  await user.click(screen.getByRole('button', { name: 'Devam et' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Ayrıntılar ve başvuru$/ })).toHaveFocus(),
  );
  const remote = screen.getByRole('checkbox', { name: /Uzaktan çalışılabilir/ });
  remote.focus();
  await user.keyboard(' ');
  expect(remote).toBeChecked();
  await user.click(screen.getByText('YBS · İşletme'));
  expect(screen.getByRole('checkbox', { name: 'YBS · İşletme' })).toBeChecked();
  for (let i = 0; i < 5; i++) await user.click(screen.getByText(`Etiket ${i}`));
  expect(screen.getByRole('checkbox', { name: 'Etiket 5' })).toBeDisabled();
  await user.click(screen.getByText('3. sınıf'));
  await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          isRemote: true,
          targetDepartmentIds: ['dep'],
          tagIds: tags.slice(0, 5).map((tag) => tag.id),
          targetGrades: [3],
        }),
      }),
    ),
  );
});

it('uzaktan filtre kutusu forma aynı ad ve değeri taşır', async () => {
  renderWithToasts(
    <PostingList
      canPost={false}
      filters={{ remote: true }}
      options={options}
      page={{ items: [posting], total: 1, page: 1, pageSize: 20 }}
    />,
  );
  const remote = document.querySelector<HTMLInputElement>('input[name="remote"]')!;
  expect(remote).toBeChecked();
  expect(remote.value).toBe('true');
  const form = remote.closest('form');
  expect(form).not.toBeNull();
  expect(new FormData(form!).get('remote')).toBe('true');
});

it('hedef bölüm sınırına ulaşınca yalnız seçilmemiş bölümler kilitlenir, seçim kaldırılınca yenisi seçilebilir', async () => {
  const departments = Array.from({ length: 11 }, (_, i) => ({
    id: `department-${i}`,
    name: `Bölüm ${i}`,
    facultyName: 'Fakülte',
  }));
  const save = vi.fn().mockResolvedValue({ ok: true, data: { id: 'draft-1' } });
  renderWithToasts(
    <PostingEditor
      context={{ ...context, targetDepartments: departments }}
      save={save}
      submit={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText(/Pozisyon adı/), { target: { value: 'Veri analisti' } });
  fireEvent.change(screen.getByLabelText(/Kurum adı/), { target: { value: 'Örnek Kurum' } });
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  for (let i = 0; i < 10; i++)
    fireEvent.click(screen.getByRole('checkbox', { name: `Bölüm ${i} · Fakülte` }));
  const first = screen.getByRole('checkbox', { name: 'Bölüm 0 · Fakülte' });
  const extra = screen.getByRole('checkbox', { name: 'Bölüm 10 · Fakülte' });
  expect(first).toBeChecked();
  expect(first).toBeEnabled();
  expect(extra).toBeDisabled();
  fireEvent.click(first);
  expect(extra).toBeEnabled();
  fireEvent.click(extra);
  expect(extra).toBeChecked();
  expect(first).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          targetDepartmentIds: departments.slice(1).map((item) => item.id),
        }),
      }),
    ),
  );
});
