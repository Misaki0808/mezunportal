// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ExperienceDetail } from '@/contracts/experience';
import { ambiguousLinkNames } from '@/test/link-names';
import { renderUi, renderWithToasts } from '@/test/render';

import { ModerationQueue } from './moderation-queue';
import { MyExperiences } from './my-experiences';
import { ReportExperience } from './report-sheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const base = {
  departmentIdAtWrite: 'd1',
  publishedAt: null,
  moderationNote: null,
  createdAt: new Date('2026-11-08T10:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
};
const content = {
  type: 'INTERNSHIP' as const,
  organizationName: 'Örnek A.Ş.',
  termYear: 2025,
  termSeason: 'SUMMER' as const,
  durationWeeks: 8,
  pay: 'PAID' as const,
  applicationChannel: 'LINKEDIN_POST' as const,
  processSteps: [],
  interviewQuestions: [],
  whatLearned: 'Çok şey öğrendim.',
  advice: 'Erken başvur.',
};
const anonymous = (id: string, status: ExperienceDetail['status'], extra = {}): ExperienceDetail =>
  ({ ...base, id, content, isAnonymous: true, status, ...extra }) as ExperienceDetail;
const page = (items: ExperienceDetail[], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});

describe('deneyimlerim', () => {
  const items = [
    anonymous('a', 'DRAFT'),
    anonymous('b', 'REJECTED', { moderationNote: 'Süreç eksik.' }),
    anonymous('c', 'PUBLISHED', { publishedAt: new Date('2026-11-08T11:00:00Z') }),
  ];

  it('durum rozeti ve ret gerekçesi görünür; düzenleme yalnız taslak/reddedilende', () => {
    renderUi(<MyExperiences initial={page(items)} list={vi.fn()} />);
    expect(screen.getAllByText('Taslak').length).toBeGreaterThan(0);
    expect(screen.getByText('Süreç eksik.')).toBeInTheDocument();
    // Her eylemden tek tane var (taslak 1, reddedilen 1): ad düz kalır. "Aç" iki kartta olduğu için sıra numarası alır.
    expect(screen.getByRole('link', { name: 'Düzelt ve yeniden gönder' })).toHaveAttribute(
      'href',
      '/deneyim/b/duzenle',
    );
    expect(screen.getByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/deneyim/a/duzenle',
    );
    // Yayındaki deneyim düzenlenmez, yalnız açılır.
    expect(screen.getByRole('link', { name: 'Örnek A.Ş. deneyimini aç (2/3)' })).toHaveAttribute(
      'href',
      '/deneyim/b',
    );
    expect(screen.getByRole('link', { name: 'Örnek A.Ş. deneyimini aç (3/3)' })).toHaveAttribute(
      'href',
      '/deneyim/c',
    );
    expect(ambiguousLinkNames()).toEqual([]);
  });

  it('birden çok taslak ve birden çok reddedilen kartın eylemleri farklı hedefler için ayırt edilir', () => {
    const many = [
      anonymous('d1', 'DRAFT'),
      anonymous('d2', 'DRAFT'),
      anonymous('r1', 'REJECTED', { moderationNote: 'Eksik.' }),
      anonymous('r2', 'REJECTED', { moderationNote: 'Eksik.' }),
    ];
    renderUi(<MyExperiences initial={page(many)} list={vi.fn()} />);
    for (const [name, href] of [
      ['Örnek A.Ş. deneyimini düzenle (1/4)', '/deneyim/d1/duzenle'],
      ['Örnek A.Ş. deneyimini düzenle (2/4)', '/deneyim/d2/duzenle'],
      ['Örnek A.Ş. deneyimini düzelt ve yeniden gönder (3/4)', '/deneyim/r1/duzenle'],
      ['Örnek A.Ş. deneyimini düzelt ve yeniden gönder (4/4)', '/deneyim/r2/duzenle'],
    ] as const)
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    // Görünür metin ad içinde kalır (sesle denetim): "Düzenle" / "Düzelt ve yeniden gönder".
    expect(screen.queryByRole('link', { name: 'Düzenle' })).toBeNull();
    expect(ambiguousLinkNames()).toEqual([]);
  });

  it('boş durumda yönlendirir', () => {
    renderUi(<MyExperiences initial={page([])} list={vi.fn()} />);
    expect(screen.getByText('Henüz deneyim yazmadın')).toBeInTheDocument();
    // Boşken tek eylem: boş durumun düğmesi kalır, alttaki yapışkan çubuk gizlenir.
    const write = screen.getAllByRole('link', { name: 'Deneyim yaz' });
    expect(write).toHaveLength(1);
    expect(write[0]).toHaveAttribute('href', '/deneyim/yeni');
    expect(write[0]!.closest('[data-action-bar]')).toBeNull();
  });

  it('doluyken "Deneyim yaz" başlığın sağındaki tek eylemdir (alttaki yapışkan çubuk kalktı)', () => {
    renderUi(<MyExperiences initial={page(items)} list={vi.fn()} />);
    const write = screen.getAllByRole('link', { name: 'Deneyim yaz' });
    expect(write).toHaveLength(1);
    expect(write[0]!.closest('header')).not.toBeNull();
    expect(write[0]!.closest('[data-action-bar]')).toBeNull();
  });
  it('kartlar ızgarada, eylemler kartın altında; boşken başlıkta eylem yok', () => {
    const { unmount } = renderUi(<MyExperiences initial={page(items)} list={vi.fn()} />);
    expect(screen.getAllByRole('listitem')[0]!.parentElement).toHaveClass('grid', 'xl:grid-cols-3');
    unmount();
    renderUi(<MyExperiences initial={page([])} list={vi.fn()} />);
    expect(screen.getAllByRole('link', { name: 'Deneyim yaz' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Deneyim yaz' }).closest('header')).toBeNull();
  });

  it('durum sekmesi sunucudan o duruma göre yeniden listeler', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, data: page([items[2]!]) });
    const { user } = renderUi(<MyExperiences initial={page(items)} list={list} />);
    await user.click(screen.getByRole('tab', { name: 'Yayında' }));
    expect(list).toHaveBeenCalledWith({ status: 'PUBLISHED' });
    expect(await screen.findByText('Yayında', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('moderasyon kuyruğu', () => {
  const setup = (
    review = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { experienceId: 'a', status: 'PUBLISHED' } }),
  ) => {
    const view = renderUi(
      <ModerationQueue
        initialExperiences={page([anonymous('a', 'PENDING')])}
        initialReports={{ items: [], nextCursor: null }}
        listExperiences={vi.fn()}
        review={review as never}
        listReports={vi.fn()}
        resolve={vi.fn()}
      />,
    );
    return { review, ...view };
  };

  it('anonim deneyimde yazar bilgisi gösterilmez ve notu yazılır', () => {
    setup();
    expect(screen.getByText('Yazar bilgisi moderasyonda gösterilmez.')).toBeInTheDocument();
  });

  it('gerekçesiz ret sunucuya gitmez ve pencerede hata gösterir; gerekçeyle gider', async () => {
    const { user, review } = setup(
      vi.fn().mockResolvedValue({ ok: true, data: { experienceId: 'a', status: 'REJECTED' } }),
    );
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    expect(review).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('kısa bir gerekçe');
    expect(within(dialog).getByLabelText(/Ret gerekçesi/)).toHaveFocus();
    await user.type(within(dialog).getByLabelText(/Ret gerekçesi/), 'Süreç adımları eksik.');
    await user.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    expect(review).toHaveBeenCalledWith({
      experienceId: 'a',
      decision: 'REJECT',
      reason: 'Süreç adımları eksik.',
    });
    expect(await screen.findByText('Deneyim reddedildi.')).toBeInTheDocument();
    expect(screen.queryByText('Örnek A.Ş.', { selector: 'h2' })).not.toBeInTheDocument();
  });

  it('yayın onay penceresinden sonra gider ve kayıt kuyruktan çıkar', async () => {
    const { user, review } = setup();
    await user.click(screen.getByRole('button', { name: 'Yayınla' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yayınla' }));
    expect(review).toHaveBeenCalledWith({ experienceId: 'a', decision: 'PUBLISH' });
    expect(await screen.findByText('Deneyim yayınlandı.')).toBeInTheDocument();
    expect(screen.getByText('İncelenecek deneyim yok')).toBeInTheDocument();
  });

  it('sunucu reddederse (yetki) kodu metne çevrilir ve kayıt kuyrukta kalır', async () => {
    const { user } = setup(vi.fn().mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' }));
    await user.click(screen.getByRole('button', { name: 'Yayınla' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yayınla' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).not.toHaveTextContent(
      'AUTH_FORBIDDEN',
    );
    expect(screen.getByText('Örnek A.Ş.', { selector: 'h2' })).toBeInTheDocument();
  });
});

describe('şikâyet alt sayfası', () => {
  it('tetikleyici sessiz ve içeriği kadar geniştir (tam genişlikli ikincil düğme değil), dokunma hedefi ≥ 44 px', () => {
    renderWithToasts(<ReportExperience experienceId="e1" report={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Bu deneyimi şikâyet et' });
    expect(trigger).toHaveClass('min-h-11', 'bg-transparent', 'text-primary');
    expect(trigger).not.toHaveClass('w-full');
    expect(trigger).not.toHaveClass('border');
  });
  it('çift gönderim tek istektir; ağ hatasında gerekçe korunur', async () => {
    const gate = Promise.withResolvers<never>();
    const report = vi.fn(() => gate.promise);
    const { user } = renderWithToasts(<ReportExperience experienceId="e1" report={report} />);
    await user.click(screen.getByRole('button', { name: 'Bu deneyimi şikâyet et' }));
    const dialog = screen.getByRole('dialog');
    const reason = within(dialog).getByLabelText(/Neden şikâyet/);
    await user.type(reason, 'Korunan gerekçe');
    const button = within(dialog).getByRole('button', { name: 'Şikâyeti gönder' });
    act(() => {
      button.click();
      button.click();
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => gate.reject(new Error('ağ')));
    expect(reason).toHaveValue('Korunan gerekçe');
    expect(within(dialog).getByText(/Beklenmeyen bir sorun/)).toBeVisible();
  });
  it('kısa gerekçeyi göndermez; geçerli gerekçeyle gönderir ve teşekkür eder', async () => {
    const report = vi.fn().mockResolvedValue({ ok: true, data: { reportId: 'r', status: 'OPEN' } });
    const { user } = renderWithToasts(
      <ReportExperience experienceId="e1" report={report as never} />,
    );
    await user.click(screen.getByRole('button', { name: 'Bu deneyimi şikâyet et' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Şikâyeti gönder' }));
    expect(report).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText('Şikâyet gerekçesi en az 3 karakter olmalı.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Neden şikâyet/), 'Yanıltıcı bilgi');
    await user.click(within(dialog).getByRole('button', { name: 'Şikâyeti gönder' }));
    expect(report).toHaveBeenCalledWith({ experienceId: 'e1', reason: 'Yanıltıcı bilgi' });
    expect((await screen.findAllByText('Şikâyetin alındı. Teşekkürler.')).length).toBeGreaterThan(
      0,
    );
  });

  it('hız sınırı ve zaten açık şikâyet kodları ham koda dönmeden gösterilir', async () => {
    const report = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderWithToasts(
      <ReportExperience experienceId="e1" report={report as never} />,
    );
    await user.click(screen.getByRole('button', { name: 'Bu deneyimi şikâyet et' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Neden şikâyet/), 'Yanıltıcı bilgi');
    await user.click(within(dialog).getByRole('button', { name: 'Şikâyeti gönder' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Çok fazla deneme');
  });
});
