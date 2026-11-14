// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi, renderWithToasts } from '@/test/render';
import type {
  JobPostingModerationPage,
  MyJobPostingPage,
  MyJobPostingView,
} from '@/contracts/job-postings';
import messages from '../../../messages/tr.json';
import { MyPostings, PostingModeration } from './manage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const mine = {
  id: 'p1',
  status: 'PUBLISHED',
  kind: 'INTERNSHIP',
  title: 'Veri analizi stajyeri',
  organizationName: 'Örnek Kurum',
  companyId: null,
  location: 'İstanbul',
  isRemote: false,
  description: null,
  applyMethod: null,
  applyUrl: null,
  deadlineOn: '2027-02-05',
  departmentId: 'dep',
  targetDepartments: [],
  tagIds: [],
  targetGrades: [],
  moderationNote: null,
  createdAt: new Date('2026-11-08T10:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
  submittedAt: new Date('2026-11-08T10:00:00Z'),
  publishedAt: new Date('2026-11-09T10:00:00Z'),
  endedAt: null,
} as unknown as MyJobPostingView;
const page = (items: MyJobPostingView[]): MyJobPostingPage => ({ items, nextCursor: null });
const render = (items: MyJobPostingView[]) =>
  renderUi(<MyPostings initial={page(items)} list={vi.fn()} close={vi.fn()} />);

describe('ilanlarım: "İlan ver" eylemi', () => {
  it('boşken tek düğme: başlıktaki gizlenir, boş durumun düğmesi kalır', () => {
    render([]);
    const post = screen.getAllByRole('link', { name: 'İlan ver' });
    expect(post).toHaveLength(1);
    expect(post[0]).toHaveAttribute('href', '/ilanlar/yeni');
    // Düğme boş durum kartının içindedir (başlık satırında değil): kardeşi boş durum başlığıdır.
    expect(post[0]!.parentElement!.querySelector('h2')).toHaveTextContent(
      'Henüz bir ilan paylaşmadın.',
    );
  });

  it('doluyken "İlan ver" başlıkta kalır (bugünkü düzen)', () => {
    render([mine]);
    expect(screen.getAllByRole('link', { name: 'İlan ver' })).toHaveLength(1);
    expect(screen.queryByText('Henüz bir ilan paylaşmadın.')).not.toBeInTheDocument();
  });
});

describe('ilan inceleme kuyruğu: karar sonrası geri bildirim', () => {
  const REASON_INVALID = messages.admin.reasonInvalid;
  const queued = (id: string, title: string) => ({
    id,
    organizationName: 'Örnek Kurum',
    author: { displayName: 'Deniz A.' },
    title,
    description: 'Staj ilanı açıklaması',
    targetDepartments: [{ name: 'Yönetim Bilişim Sistemleri' }],
    deadlineOn: '2027-02-05',
  });
  const queue = {
    items: [queued('q1', 'Veri analizi stajyeri'), queued('q2', 'Yazılım stajyeri')],
    nextCursor: null,
  } as unknown as JobPostingModerationPage;
  const review = vi.fn();
  const renderQueue = () =>
    renderWithToasts(<PostingModeration initial={queue} review={review} list={vi.fn()} />);
  const row = (title: string) => within(screen.getByText(title).closest('li')!);

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => {
    review.mockReset();
    review.mockResolvedValue({ ok: true, data: {} });
  });

  it('boş gerekçe hatası, gerekçe yazılıp ret başarılı olunca sayfada kalmaz', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(dialog.getByText(REASON_INVALID)).toBeVisible();
    expect(review).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText(/Ret gerekçesi/), 'Başvuru bağlantısı eksik');
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(screen.queryByText('Veri analizi stajyeri')).toBeNull());
    expect(review).toHaveBeenCalledWith({
      postingId: 'q1',
      decision: 'REJECT',
      reason: 'Başvuru bağlantısı eksik',
    });
    expect(screen.queryByText(REASON_INVALID)).toBeNull();
  });

  it('boş gerekçeden sonraki ilanın penceresi hatasız açılır', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    let dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(dialog.getByText(REASON_INVALID)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Vazgeç' }));
    await user.click(row('Yazılım stajyeri').getByRole('button', { name: 'Reddet' }));
    dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByText(REASON_INVALID)).toBeNull();
  });

  it('yayımlama başarılı olunca görünür bildirim verir', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('İlan yayımlandı.')).toBeVisible();
    expect(screen.queryByText('Veri analizi stajyeri')).toBeNull();
  });

  it('ret başarılı olunca görünür bildirim verir', async () => {
    const { user } = renderQueue();
    await user.click(row('Yazılım stajyeri').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Ret gerekçesi/), 'Kurum bilgisi doğrulanamadı');
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('İlan reddedildi.')).toBeVisible();
  });

  it('karar başarısızsa başarı bildirimi vermez; hata pencerede kalır', async () => {
    review.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await dialog.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
    expect(screen.queryByText('İlan yayımlandı.')).toBeNull();
    expect(screen.getByText('Veri analizi stajyeri')).toBeVisible();
  });
});

describe('ilanlarım: kapatma hatası sonraki başarıdan sonra kalmaz', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });

  it('ilk deneme hata verip ikincisi geçince hata ekranda kalmaz', async () => {
    const close = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' })
      .mockResolvedValueOnce({ ok: true, data: {} });
    const { user } = renderUi(<MyPostings initial={page([mine])} list={vi.fn()} close={close} />);
    await user.click(screen.getByRole('button', { name: 'İlanı kapat' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'İlanı kapat' }));
    expect(await dialog.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'İlanı kapat' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeNull();
  });
});
