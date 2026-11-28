// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
const render = (items: MyJobPostingView[], canPost = true) =>
  renderUi(<MyPostings initial={page(items)} canPost={canPost} list={vi.fn()} close={vi.fn()} />);

describe('ilanlarım: "İlan paylaş" eylemi', () => {
  it('boşken tek düğme: başlıktaki gizlenir, boş durumun düğmesi kalır', () => {
    render([]);
    const post = screen.getAllByRole('link', { name: 'İlan paylaş' });
    expect(post).toHaveLength(1);
    expect(post[0]).toHaveAttribute('href', '/ilanlar/yeni');
    // Düğme boş durum kartının içindedir (başlık satırında değil): kardeşi boş durum başlığıdır.
    expect(post[0]!.parentElement!.querySelector('h2')).toHaveTextContent(
      'Henüz bir ilan paylaşmadın.',
    );
  });

  it('doluyken "İlan paylaş" başlıkta kalır (bugünkü düzen)', () => {
    render([mine]);
    expect(screen.getAllByRole('link', { name: 'İlan paylaş' })).toHaveLength(1);
    expect(screen.queryByText('Henüz bir ilan paylaşmadın.')).not.toBeInTheDocument();
  });

  const reason =
    'İlanları 4. sınıflar ve mezunlar paylaşabilir. Gördüğün bir ilanı 4. sınıftan bir arkadaşına iletebilirsin.';
  it('sınıfı yetmeyen kişide (kart 577): dolu listede oluşturma bağlantısı yok, sebep yazar; eski kayıt ve kapatma eylemi kalır', () => {
    const draft = {
      ...mine,
      id: 'draft-1',
      status: 'DRAFT',
      title: 'Eski taslak',
    } as MyJobPostingView;
    render([draft, { ...mine, id: 'pending-1', status: 'PENDING' } as MyJobPostingView], false);
    expect(screen.queryByRole('link', { name: 'İlan paylaş' })).not.toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('Eski taslak')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Düzenle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İlanı kapat' })).toBeInTheDocument();
  });

  it('sınıfı yetmeyen kişide (kart 577): boş listede de oluşturma bağlantısı yok, sebep yazar', () => {
    render([], false);
    expect(screen.queryByRole('link', { name: 'İlan paylaş' })).not.toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('Henüz bir ilan paylaşmadın.')).toBeInTheDocument();
  });

  it('sınıfı yeten kişide sebep satırı çizilmez', () => {
    render([mine]);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
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

  it('inceleme kuyruğu son başvuru gününü ham ISO değil okunur tarihle gösterir', () => {
    renderQueue();
    expect(screen.getAllByText(/5 Şubat 2027/)).toHaveLength(2);
    expect(screen.queryByText(/2027-02-05/)).toBeNull();
  });

  it('öğrencinin paylaştığı ilanda yönetici rolü "öğrenci" ve hedef bağlantıyı (yeni sekme, noopener) görür; geçersiz bağlantı bağlantıya çevrilmez', () => {
    const student = (id: string, title: string, applyUrl: string) =>
      ({
        ...queued(id, title),
        author: { displayName: 'Elif D.', role: 'STUDENT' },
        applyMethod: 'URL',
        applyUrl,
      }) as unknown as JobPostingModerationPage['items'][number];
    const alumniItem = {
      ...queued('q3', 'Mezun ilanı'),
      author: { displayName: 'Mert Y.', role: 'ALUMNI' },
      applyMethod: 'CONTACT_REQUEST',
      applyUrl: null,
    } as unknown as JobPostingModerationPage['items'][number];
    renderWithToasts(
      <PostingModeration
        initial={{
          items: [
            student('q1', 'Öğrenci ilanı', 'https://www.youthall.com/ilan/42'),
            student('q2', 'Tehlikeli ilan', 'javascript:alert(1)'),
            alumniItem,
          ],
          nextCursor: null,
        }}
        review={review}
        list={vi.fn()}
      />,
    );
    const shared = row('Öğrenci ilanı');
    expect(shared.getByText(/Paylaşan: Elif D\. \(öğrenci\)/)).toBeVisible();
    const link = shared.getByRole('link', { name: /youthall\.com\/ilan\/42/ });
    expect(link).toHaveAttribute('href', 'https://www.youthall.com/ilan/42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(row('Tehlikeli ilan').queryByRole('link')).toBeNull();
    expect(row('Mezun ilanı').getByText(/Paylaşan: Mert Y\./)).toBeVisible();
    expect(row('Mezun ilanı').queryByText(/\(öğrenci\)/)).toBeNull();
    expect(row('Mezun ilanı').queryByRole('link')).toBeNull();
  });

  it('boş gerekçe hatası, gerekçe yazılıp ret başarılı olunca sayfada kalmaz', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'İlanı reddet' }));
    expect(dialog.getByText(REASON_INVALID)).toBeVisible();
    expect(review).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText(/Ret gerekçesi/), 'Başvuru bağlantısı eksik');
    await user.click(dialog.getByRole('button', { name: 'İlanı reddet' }));
    await waitFor(() => expect(screen.queryByText('Veri analizi stajyeri')).toBeNull());
    expect(review).toHaveBeenCalledWith({
      postingId: 'q1',
      decision: 'REJECT',
      reason: 'Başvuru bağlantısı eksik',
    });
    expect(screen.queryByText(REASON_INVALID)).toBeNull();
  });

  it('1001 karakterlik ret gerekçesi kesilmez ve alan hatasıyla odaklanır', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    const input = dialog.getByLabelText(/Ret gerekçesi/);
    expect(input).not.toHaveAttribute('maxlength');
    const value = 'İ'.repeat(1001);
    fireEvent.change(input, { target: { value } });
    await user.click(dialog.getByRole('button', { name: 'İlanı reddet' }));
    expect(input).toHaveValue(value);
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription(/En fazla 1000 karakter yaz/);
    expect(review).not.toHaveBeenCalled();
  });

  it('boş gerekçeden sonraki ilanın penceresi hatasız açılır', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    let dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'İlanı reddet' }));
    expect(dialog.getByText(REASON_INVALID)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Vazgeç' }));
    await user.click(row('Yazılım stajyeri').getByRole('button', { name: 'Reddet' }));
    dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByText(REASON_INVALID)).toBeNull();
  });

  it('ret penceresinin onay düğmesi işi açıkça söyler: "İlanı reddet", "Onayla" değil', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Reddet' }));
    const reject = within(await screen.findByRole('dialog'));
    expect(reject.getByRole('button', { name: 'İlanı reddet' })).toBeVisible();
    expect(reject.queryByRole('button', { name: 'Onayla' })).toBeNull();
    await user.click(reject.getByRole('button', { name: 'Vazgeç' }));
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const publish = within(await screen.findByRole('dialog'));
    expect(publish.getByRole('button', { name: 'Onayla' })).toBeVisible();
  });

  it('yayımlama başarılı olunca görünür bildirim verir', async () => {
    const { user } = renderQueue();
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('İlan yayımlandı.')).toBeVisible();
    expect(screen.queryByText('Veri analizi stajyeri')).toBeNull();
  });

  it('yüklü bütün ilanlar işlenince sıradaki sayfa kendiliğinden yüklenir; boş durum yalnız gerçekten boşken görünür', async () => {
    const list = vi.fn().mockResolvedValue({
      ok: true,
      data: { items: [queued('q3', 'Sonraki sayfadaki ilan')], nextCursor: null },
    });
    const paged = {
      items: [queued('q1', 'Veri analizi stajyeri')],
      nextCursor: 'imlec-1',
    } as unknown as JobPostingModerationPage;
    const { user } = renderWithToasts(
      <PostingModeration initial={paged} review={review} list={list} />,
    );
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Sonraki sayfadaki ilan')).toBeVisible();
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ cursor: 'imlec-1' });
    expect(screen.queryByText(messages.jobs.moderationEmpty)).toBeNull();
  });

  it('sıradaki sayfa yüklenemezse sonsuz yeniden deneme olmaz; "Daha fazla" düğmesi kalır', async () => {
    const list = vi.fn().mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const paged = {
      items: [queued('q1', 'Veri analizi stajyeri')],
      nextCursor: 'imlec-1',
    } as unknown as JobPostingModerationPage;
    const { user } = renderWithToasts(
      <PostingModeration initial={paged} review={review} list={list} />,
    );
    await user.click(row('Veri analizi stajyeri').getByRole('button', { name: 'Yayımla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: messages.jobs.loadMore })).toBeVisible();
    expect(screen.queryByText(messages.jobs.moderationEmpty)).toBeNull();
  });

  it('ret başarılı olunca görünür bildirim verir', async () => {
    const { user } = renderQueue();
    await user.click(row('Yazılım stajyeri').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Ret gerekçesi/), 'Kurum bilgisi doğrulanamadı');
    await user.click(dialog.getByRole('button', { name: 'İlanı reddet' }));
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
    const { user } = renderUi(
      <MyPostings initial={page([mine])} canPost list={vi.fn()} close={close} />,
    );
    await user.click(screen.getByRole('button', { name: 'İlanı kapat' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'İlanı kapat' }));
    expect(await dialog.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
    // Hata görününce geçiş henüz bitmemiş olabilir: onay düğmesi bu sürede başka adla pasiftir (kart 502).
    await waitFor(() => expect(dialog.getByRole('button', { name: 'İlanı kapat' })).toBeEnabled());
    await user.click(dialog.getByRole('button', { name: 'İlanı kapat' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeNull();
  });
});

describe('ilanlarım: ilan kapatılınca odak', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });
  const second = { ...mine, id: 'p2', title: 'Yazılım stajyeri' } as unknown as MyJobPostingView;
  const closeFirst = async (items: MyJobPostingView[]) => {
    const close = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const { user } = renderUi(
      <MyPostings initial={page(items)} canPost list={vi.fn()} close={close} />,
    );
    await user.click(screen.getAllByRole('button', { name: 'İlanı kapat' })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'İlanı kapat' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  it('kapatılan ilanın düğmesi kalkınca odak gövdeye düşmez, sıradaki ilanın kapat düğmesine gider', async () => {
    await closeFirst([mine, second]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'İlanı kapat' })).toHaveFocus());
  });

  it('son açık ilan kapatılınca odak sayfa başlığına gider', async () => {
    await closeFirst([mine]);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'İlanlarım' })).toHaveFocus(),
    );
  });
});

describe('ilanlarım: ortak başlık (kart 424)', () => {
  it('geri bağlantısı ilanlara gider; doluyken "İlan paylaş" başlığın eylem alanındadır', () => {
    render([mine]);
    expect(screen.getByRole('link', { name: 'İlanlara dön' })).toHaveAttribute('href', '/ilanlar');
    const header = screen.getByRole('heading', { level: 1, name: 'İlanlarım' }).closest('header')!;
    expect(within(header).getByRole('link', { name: 'İlan paylaş' })).toHaveAttribute(
      'href',
      '/ilanlar/yeni',
    );
  });
});
