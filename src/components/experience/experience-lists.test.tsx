// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ExperienceDetail } from '@/contracts/experience';
import { renderUi } from '@/test/render';

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
    expect(screen.getByRole('link', { name: 'Düzelt ve yeniden gönder' })).toHaveAttribute(
      'href',
      '/deneyim/b/duzenle',
    );
    expect(screen.getByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/deneyim/a/duzenle',
    );
    // Yayındaki deneyim düzenlenmez, yalnız açılır.
    expect(screen.getAllByRole('link', { name: 'Aç' })).toHaveLength(2);
  });

  it('boş durumda yönlendirir', () => {
    renderUi(<MyExperiences initial={page([])} list={vi.fn()} />);
    expect(screen.getByText('Henüz deneyim yazmadın')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Deneyim yaz' })[0]).toHaveAttribute(
      'href',
      '/deneyim/yeni',
    );
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
  it('kısa gerekçeyi göndermez; geçerli gerekçeyle gönderir ve teşekkür eder', async () => {
    const report = vi.fn().mockResolvedValue({ ok: true, data: { reportId: 'r', status: 'OPEN' } });
    const { user } = renderUi(<ReportExperience experienceId="e1" report={report as never} />);
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
    expect(await screen.findByText('Şikâyetin alındı. Teşekkürler.')).toBeInTheDocument();
  });

  it('hız sınırı ve zaten açık şikâyet kodları ham koda dönmeden gösterilir', async () => {
    const report = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderUi(<ReportExperience experienceId="e1" report={report as never} />);
    await user.click(screen.getByRole('button', { name: 'Bu deneyimi şikâyet et' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Neden şikâyet/), 'Yanıltıcı bilgi');
    await user.click(within(dialog).getByRole('button', { name: 'Şikâyeti gönder' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Çok fazla deneme');
  });
});
