// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { FeedbackForm } from './feedback-form';

const submit = vi.hoisted(() => vi.fn());
vi.mock('@/server/actions/feedback', () => ({ submitSessionFeedback: submit }));

const view = {
  appointmentId: 'ap1',
  counterpartName: 'Mert Yıldız',
  startsAt: new Date('2026-11-01T08:00:00Z'),
  endsAt: new Date('2026-11-01T08:30:00Z'),
  role: 'MENTEE' as const,
  submitted: false,
};

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({ ok: true, data: {} });
});

async function answerQuestions(user: ReturnType<typeof renderUi>['user']) {
  for (const question of [
    'Mentor seni dinledi ve sorularınla ilgilendi mi?',
    'Görüşmeden işine yarayacak somut bir şey çıktı mı? (yol haritası, kaynak, tavsiye)',
    'Görüşme zamanında başladı mı?',
  ]) {
    const group = screen.getByRole('group', { name: question });
    await user.click(within(group).getAllByRole('radio')[0]!);
  }
  await user.click(screen.getByRole('radio', { name: '4,5 / 5' }));
}

describe('FeedbackForm', () => {
  it('yanıt seçilmediğinde ilk seçeneğe odaklanır ve alan hatasını bağlar', async () => {
    renderUi(<FeedbackForm view={view} />);
    const first = screen.getByRole('radio', { name: 'Evet, gerçekleşti' });
    fireEvent.submit(screen.getByRole('button', { name: 'Yanıtı gönder' }).closest('form')!);
    expect(submit).not.toHaveBeenCalled();
    expect(first).toHaveFocus();
    expect(first).toBeInvalid();
    expect(first).toHaveAccessibleDescription(/seç/i);
  });
  it('sunucu not alanı hatasını notun altında gösterir ve girdiyi korur', async () => {
    submit.mockResolvedValue({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { note: 'VALIDATION_INVALID' },
    });
    const { user } = renderUi(<FeedbackForm view={view} />);
    await user.click(screen.getByRole('radio', { name: 'Evet, gerçekleşti' }));
    await answerQuestions(user);
    const note = screen.getByLabelText(/Eklemek istediğin/);
    await user.type(note, 'Türkçe not');
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    await waitFor(() => expect(note).toHaveFocus());
    expect(note).toHaveValue('Türkçe not');
    expect(note).toBeInvalid();
    expect(note).toHaveAttribute('aria-describedby');
  });
  it('1001 karakterlik notu kesmeden reddeder ve alana odaklanır', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    await user.click(screen.getByRole('radio', { name: 'Evet, gerçekleşti' }));
    await answerQuestions(user);
    const note = screen.getByLabelText(/Eklemek istediğin/);
    expect(note).not.toHaveAttribute('maxlength');
    fireEvent.change(note, { target: { value: 'İ'.repeat(1001) } });
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    expect(note).toHaveValue('İ'.repeat(1001));
    expect(note).toHaveFocus();
    expect(note).toHaveAccessibleDescription(/en fazla 1000/);
    expect(submit).not.toHaveBeenCalled();
  });
  it('iki grup da kit radyosudur (24 px, tarayıcı çizimi değil); ad korunur, başta seçili yok', () => {
    renderUi(<FeedbackForm view={view} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => (radio as HTMLInputElement).name)).toEqual([
      'happened',
      'happened',
    ]);
    for (const radio of radios) expect(radio).toHaveClass('appearance-none', 'size-6');
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    // Zorunlu: seçmeden gönderim tarayıcı doğrulamasına takılır.
    expect(radios.every((radio) => (radio as HTMLInputElement).required)).toBe(true);
  });

  it('gerçekleştiyse üç farklı soru ve yarım puan zorunlu; veri eyleme gider', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    await user.click(screen.getByRole('radio', { name: 'Evet, gerçekleşti' }));
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    expect(submit).not.toHaveBeenCalled();
    await answerQuestions(user);
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        appointmentId: 'ap1',
        happened: true,
        answers: ['POSITIVE', 'POSITIVE', 'POSITIVE'],
        rating: 4.5,
        note: null,
      }),
    );
  });

  it('mentor farklı soruları görür ve yarım puanı klavyeyle seçebilir', async () => {
    const { user } = renderUi(<FeedbackForm view={{ ...view, role: 'MENTOR' }} />);
    await user.click(screen.getByRole('radio', { name: 'Evet, gerçekleşti' }));
    expect(screen.getByRole('group', { name: 'Öğrenci istekli ve ilgili miydi?' })).toBeVisible();
    expect(
      screen.getByRole('group', {
        name: 'Öğrenci görüşmeye hazırlıklı geldi mi? (soruları, hedefi, CV’si)',
      }),
    ).toBeVisible();
    expect(screen.getByRole('group', { name: 'Öğrenci zamanında katıldı mı?' })).toBeVisible();
    const first = screen.getByRole('radio', { name: '0,5 / 5' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '1 / 5' })).toBeChecked();
  });

  it('gerçekleşmediyse sorular yok ve alanlar boş gönderilir', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    await user.click(screen.getByRole('radio', { name: 'Hayır, gerçekleşmedi' }));
    expect(screen.queryByRole('radio', { name: '4,5 / 5' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        appointmentId: 'ap1',
        happened: false,
        answers: null,
        rating: null,
        note: null,
      }),
    );
  });

  it('klavye: ok tuşu aynı gruptaki sonraki seçeneği seçer', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    const [yes, no] = screen.getAllByRole('radio') as HTMLInputElement[];

    yes!.focus();
    await user.keyboard('{ArrowDown}');

    expect(no).toBeChecked();
    expect(no).toHaveFocus();
  });

  it('etiket kartının tamamı tıklanır (dokunma hedefi ≥ 48 px sınıfı korunur)', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    const yes = screen.getByRole('radio', { name: 'Evet, gerçekleşti' });

    expect(yes.closest('label')).toHaveClass('min-h-12');
    await user.click(screen.getByText('Evet, gerçekleşti'));

    expect(yes).toBeChecked();
  });
});

describe('FeedbackForm: hesap çerçevesi (kart 407)', () => {
  it('HESAP üst etiketi, tek h1; geri bağlantısı görüşmelerime gider', () => {
    renderUi(<FeedbackForm view={view} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Görüşmen nasıldı?' })).toBeVisible();
    expect(screen.getByText('HESAP')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Görüşmelerime dön' })).toHaveAttribute(
      'href',
      '/hesap/gorusmeler',
    );
  });
});
