// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
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

describe('FeedbackForm', () => {
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

  it('"faydalı mı" grubu yalnız görüşme gerçekleştiyse açılır; seçimler eyleme aynen gider', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);
    expect(screen.queryByRole('radio', { name: 'Evet, faydalıydı' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Evet, gerçekleşti' }));
    const helpful = screen
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).name === 'helpful');
    expect(helpful).toHaveLength(2);
    for (const radio of helpful) expect(radio).toHaveClass('appearance-none', 'size-6');
    await user.click(screen.getByRole('radio', { name: 'Evet, faydalıydı' }));
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        appointmentId: 'ap1',
        happened: true,
        helpful: true,
        note: null,
      }),
    );
  });

  it('"gerçekleşmedi" seçilince ikinci grup yoktur ve faydalı bilgisi null gider', async () => {
    const { user } = renderUi(<FeedbackForm view={view} />);

    await user.click(screen.getByRole('radio', { name: 'Hayır, gerçekleşmedi' }));
    expect(screen.queryByRole('radio', { name: 'Evet, faydalıydı' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        appointmentId: 'ap1',
        happened: false,
        helpful: null,
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
