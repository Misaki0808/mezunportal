// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  FaqModerationItem,
  FaqSearchPage,
  MentorFaqRequestView,
  MyFaqRequestView,
} from '@/contracts/faq';
import { renderUi } from '@/test/render';

import { FaqList } from './faq-list';
import { MentorRequests } from './mentor-requests';
import { FaqModerationQueue, type ModerationActions } from './moderation-queue';
import { StudentFaq } from './student-faq';
import { SUGGEST_DELAY_MS } from './request-form';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.useRealTimers());

const QUESTION = 'Staj başvurusunda hangi belgeler isteniyor?';
const page = (over: Partial<FaqSearchPage> = {}): FaqSearchPage => ({
  items: [
    {
      id: 'f1',
      question: 'Staj için CV nasıl hazırlanır?',
      answer: 'Kısa ve sonuç odaklı yaz.',
      publishedAt: new Date('2026-11-01T09:00:00Z'),
    },
  ],
  total: 45,
  page: 2,
  pageSize: 20,
  ...over,
});

describe('SSS sayfası ve arama', () => {
  it('soru, cevap ve tarih görünür; kimlik alanı yok; arama GET formudur', () => {
    renderUi(<FaqList result={page()} q="cv" />);
    expect(screen.getByRole('search')).toHaveAttribute('action', '/sss');
    expect(screen.getByRole('searchbox')).toHaveValue('cv');
    expect(screen.getByText('Staj için CV nasıl hazırlanır?')).toBeVisible();
    expect(screen.getByText('“cv” için 45 soru')).toBeVisible();
    expect(document.body.textContent).not.toMatch(/@|\+90/);
  });

  it('sayfalama bağlantıları sorguyu korur', () => {
    renderUi(<FaqList result={page()} q="cv" />);
    expect(screen.getByRole('link', { name: /Sonraki/ })).toHaveAttribute(
      'href',
      '/sss?q=cv&page=3',
    );
    expect(screen.getByRole('link', { name: /Önceki/ })).toHaveAttribute('href', '/sss?q=cv');
  });

  it('boş sonuçta açıklayıcı durum gösterir', () => {
    renderUi(<FaqList result={page({ items: [], total: 0, page: 1 })} q="xyz" />);
    expect(screen.getByText('Soru bulunamadı.')).toBeVisible();
    expect(screen.getByText('Başka sözcüklerle aramayı dene.')).toBeVisible();
  });
});

const request = (over: Partial<MyFaqRequestView> = {}): MyFaqRequestView => ({
  id: 'r1',
  question: QUESTION,
  status: 'OPEN',
  createdAt: new Date('2026-11-02T09:00:00Z'),
  decidedAt: null,
  decisionNote: null,
  faqItemId: null,
  directoryHref: null,
  ...over,
});

function student(over: Record<string, unknown> = {}) {
  const props = {
    initial: { items: [request()], nextCursor: null },
    suggest: vi.fn(async () => ({ ok: true as const, data: [] })),
    submit: vi.fn(async () => ({ ok: true as const, data: { requestId: 'r2' } })),
    list: vi.fn(async () => ({
      ok: true as const,
      data: { items: [request()], nextCursor: null },
    })),
    ...over,
  };
  renderUi(<StudentFaq {...(props as unknown as Parameters<typeof StudentFaq>[0])} />);
  return props;
}
const typeQuestion = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Sorun/), { target: { value } });

describe('SSS talebi gönder (öğrenci)', () => {
  it('yazma durunca benzer SSS gösterilir; her tuşta istek gitmez', async () => {
    vi.useFakeTimers();
    const p = student({
      suggest: vi.fn(async () => ({
        ok: true as const,
        data: [{ id: 'f9', question: 'Staj belgeleri nelerdir?' }],
      })),
    });
    typeQuestion('Staj başvurusunda hangi belge');
    typeQuestion(QUESTION);
    expect(p.suggest).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS + 50);
    });
    expect(p.suggest).toHaveBeenCalledTimes(1);
    expect(p.suggest).toHaveBeenCalledWith({ text: QUESTION });
    expect(screen.getByRole('link', { name: 'Staj belgeleri nelerdir?' })).toHaveAttribute(
      'href',
      '/sss/f9',
    );
  });

  it('çok kısa soru istek göndermez ve alan hatası verir', async () => {
    const p = student();
    typeQuestion('kısa');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    expect(p.submit).not.toHaveBeenCalled();
    expect(await screen.findByText('Soru 15–500 karakter olmalı.')).toBeVisible();
  });

  it('benzer SSS varken önce onay ister, onayla yeniden gönderir', async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, errorCode: 'FAQ_SIMILAR_EXISTS' })
      .mockResolvedValueOnce({ ok: true, data: { requestId: 'r2' } });
    student({ submit });
    typeQuestion(QUESTION);
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    expect(await screen.findByText(/Benzer sorular zaten yayında/)).toBeVisible();
    const send = screen.getByRole('button', { name: 'Talebi gönder' });
    expect(send).toBeDisabled();
    expect(
      screen.getByText('Önce benzer soruları gördüğünü onayla.', { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /yine de göndermek istiyorum/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenLastCalledWith({ question: QUESTION, similarAcknowledged: true });
    expect(await screen.findByRole('status')).toHaveTextContent('Talebin alındı');
  });

  it('hız sınırı ve kişisel veri hataları katalog metniyle gösterilir; gönderim sırasında kilitli', async () => {
    const gate = Promise.withResolvers<{ ok: false; errorCode: 'RATE_LIMITED' }>();
    const submit = vi.fn(() => gate.promise);
    student({ submit });
    typeQuestion(QUESTION);
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    fireEvent.click(screen.getByRole('button', { name: /Talebi gönder/ }));
    expect(submit).toHaveBeenCalledTimes(1);
    gate.resolve({ ok: false, errorCode: 'RATE_LIMITED' });
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('taleplerim: durum, ret gerekçesi, yönlendirmede mentor dizini ve yayında SSS bağlantısı', () => {
    student({
      initial: {
        items: [
          request({ id: 'a', status: 'REJECTED', decisionNote: 'Çok genel bir soru' }),
          request({
            id: 'b',
            status: 'REDIRECTED',
            decisionNote: 'Bu sana özel.',
            directoryHref: '/mentorlar',
          }),
          request({ id: 'c', status: 'PUBLISHED', faqItemId: 'f7' }),
          request({ id: 'd' }),
        ],
        nextCursor: null,
      },
    });
    const list = within(screen.getByRole('region', { name: 'Taleplerim' }));
    expect(list.getByText('Gerekçe: Çok genel bir soru')).toBeVisible();
    expect(list.getByRole('link', { name: /Mentor dizinine git/ })).toHaveAttribute(
      'href',
      '/mentorlar',
    );
    expect(list.getByText(/Bu sana özel\./)).toBeVisible();
    expect(list.getByRole('link', { name: /Yayınlanan soruyu gör/ })).toHaveAttribute(
      'href',
      '/sss/f7',
    );
    expect(list.getByText('Bekliyor')).toBeVisible();
  });
});

const mentorItem = (over: Partial<MentorFaqRequestView> = {}): MentorFaqRequestView => ({
  id: 'm1',
  question: QUESTION,
  createdAt: new Date('2026-11-02T09:00:00Z'),
  myAnswer: null,
  ...over,
});

describe('mentor cevap formu', () => {
  it('kısa cevap gönderilmez; geçerli cevap kaydedilir ve durum güncellenir', async () => {
    const answer = vi.fn(async () => ({ ok: true as const, data: { answerId: 'a1' } }));
    renderUi(
      <MentorRequests
        initial={{ items: [mentorItem()], nextCursor: null }}
        list={vi.fn()}
        answer={answer}
      />,
    );
    expect(screen.getByText('Cevap bekliyor')).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Cevabın/), { target: { value: 'kısa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı gönder' }));
    expect(answer).not.toHaveBeenCalled();
    expect(await screen.findByText('Cevap 20–2000 karakter olmalı.')).toBeVisible();
    const body = 'Başvuruda transkript ve CV isteniyor, ayrıntı ilanda yazıyor.';
    fireEvent.change(screen.getByLabelText(/Cevabın/), { target: { value: body } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı gönder' }));
    await waitFor(() => expect(answer).toHaveBeenCalledWith({ requestId: 'm1', body }));
    expect(await screen.findByText('Cevabın kaydedildi.')).toBeVisible();
    expect(screen.getByText('Cevapladın')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cevabı güncelle' })).toBeVisible();
  });

  it('kendi talebine cevap hatası katalog metniyle görünür; soran kimliği çizilmez', async () => {
    const answer = vi.fn(async () => ({
      ok: false as const,
      errorCode: 'FAQ_OWN_REQUEST' as const,
    }));
    renderUi(
      <MentorRequests
        initial={{ items: [mentorItem()], nextCursor: null }}
        list={vi.fn()}
        answer={answer}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Cevabın/), {
      target: { value: 'Yeterince uzun bir cevap metni yazıyorum.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı gönder' }));
    expect(await screen.findByText('Kendi sorduğun soruya cevap yazamazsın.')).toBeVisible();
  });
});

const item = (over: Partial<FaqModerationItem> = {}): FaqModerationItem => ({
  id: 'q1',
  question: QUESTION,
  createdAt: new Date('2026-11-02T09:00:00Z'),
  answers: [
    { id: 'a1', body: 'Birinci mentor cevabı, yeterince uzun.' },
    { id: 'a2', body: 'İkinci mentor cevabı, biraz daha ayrıntılı.' },
  ],
  ...over,
});
const actions = (over: Partial<ModerationActions> = {}): ModerationActions => ({
  list: vi.fn(),
  publish: vi.fn(async () => ({ ok: true as const, data: { faqItemId: 'f1' } })),
  reject: vi.fn(async () => ({
    ok: true as const,
    data: { requestId: 'q1', status: 'REJECTED' as const },
  })),
  redirect: vi.fn(async () => ({
    ok: true as const,
    data: { requestId: 'q1', status: 'REDIRECTED' as const },
  })),
  ...over,
});
const dialog = () => within(screen.getByRole('dialog'));

describe('moderatör kuyruğu', () => {
  it('seçilen cevap ve düzenlenen metinle yayımlar; satır kuyruktan çıkar', async () => {
    const a = actions();
    renderUi(<FaqModerationQueue initial={{ items: [item()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('radio', { name: /Cevap 2/ }));
    fireEvent.change(screen.getByLabelText('Yayınlanacak cevap', { exact: false }), {
      target: { value: 'Düzenlenmiş cevap metni, isimsiz ve yeterince uzun.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yayımla' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Yayımla' }));
    await waitFor(() =>
      expect(a.publish).toHaveBeenCalledWith({
        requestId: 'q1',
        selectedAnswerId: 'a2',
        question: QUESTION,
        answer: 'Düzenlenmiş cevap metni, isimsiz ve yeterince uzun.',
      }),
    );
    expect(await screen.findByText('SSS yayımlandı.')).toBeVisible();
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
  });

  it('yayın metninde kimlik sızıntısı hatası pencerede görünür ve satır kalır', async () => {
    const a = actions({
      publish: vi.fn(async () => ({ ok: false as const, errorCode: 'FAQ_IDENTITY_LEAK' as const })),
    });
    renderUi(<FaqModerationQueue initial={{ items: [item()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yayımla' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Yayımla' }));
    expect(
      await dialog().findByText(/Yayınlanacak metinde ad, e-posta ya da telefon var/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeVisible();
  });

  it('ret ve yönlendirme gerekçesiz gönderilmez; gerekçeyle gider', async () => {
    const a = actions();
    renderUi(<FaqModerationQueue initial={{ items: [item()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Reddet' }));
    expect(a.reject).not.toHaveBeenCalled();
    expect(await dialog().findByText('En az 3 karakter yaz.')).toBeVisible();
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Çok genel' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Reddet' }));
    await waitFor(() =>
      expect(a.reject).toHaveBeenCalledWith({ requestId: 'q1', reason: 'Çok genel' }),
    );
    expect(await screen.findByText('Talep reddedildi.')).toBeVisible();
  });

  it('cevabı olmayan talepte yayımla sebepli devre dışı; yönlendirme açık', () => {
    renderUi(
      <FaqModerationQueue
        initial={{ items: [item({ answers: [] })], nextCursor: null }}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yayımla' })).toBeDisabled();
    expect(
      screen.getByText('Yayımlamak için en az bir mentor cevabı gerekir.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mentorluğa yönlendir' })).toBeEnabled();
  });
});
