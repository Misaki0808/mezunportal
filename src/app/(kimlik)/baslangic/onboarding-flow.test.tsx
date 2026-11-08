// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { COMPLETION_FIELDS, type OnboardingState } from '@/contracts/profile';
import { CONTACT_FIELDS, DEFAULT_FIELD_VISIBILITY } from '@/contracts/privacy';
import { renderUi } from '@/test/render';
import { OnboardingFlow } from './onboarding-flow';

const initial: OnboardingState = {
  step: 'INTERESTS',
  steps: COMPLETION_FIELDS.map((step) => ({
    step,
    status: step === 'MEMBERSHIP' ? ('COMPLETED' as const) : ('PENDING' as const),
    skippable: step !== 'MEMBERSHIP',
    applicable: step !== 'MENTOR_PREFERENCE',
  })),
  interestTagIds: [],
  goalTagIds: [],
  mentorInterested: null,
  completion: { percent: 25, missing: ['INTERESTS', 'GOALS', 'VISIBILITY'] },
  studentMentorEligibility: { eligible: false, reason: 'EXPERIENCE_UNAVAILABLE' },
};
const visibility = {
  fields: CONTACT_FIELDS.map((field) => ({
    field,
    level: DEFAULT_FIELD_VISIBILITY[field],
    isDefault: true,
  })),
} as const;
const interests = [{ id: 'i', kind: 'INTEREST' as const, slug: 'software' }];
const goals = [{ id: 'g', kind: 'GOAL' as const, slug: 'internship' }];
const saveVisibility = vi.fn();

describe('ilk giriş akışı', () => {
  it('geri gidip dönünce kaydedilmiş ilgi ve henüz kaydedilmemiş hedef seçimlerini korur', async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...initial, step: 'GOALS', interestTagIds: ['i'] } });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Yazılım geliştirme' }));
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Staj bulmak' }));
    await user.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('checkbox', { name: 'Yazılım geliştirme' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(await screen.findByRole('checkbox', { name: 'Staj bulmak' })).toBeChecked();
  });
  it('tamamlanmış akış düzenlemede atlanan ilk uygulanabilir adımdan açılır ve kayıt sonrası ilerler', async () => {
    const complete = {
      ...initial,
      step: 'COMPLETE' as const,
      steps: initial.steps.map((item) =>
        item.step === 'INTERESTS' ? { ...item, status: 'SKIPPED' as const } : item,
      ),
    };
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...complete, interestTagIds: ['i'] } });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={complete}
        editInitially
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Yazılım geliştirme' }));
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(
      await screen.findByRole('heading', { name: 'Birlikte neyi hedefleyelim?' }),
    ).toBeVisible();
    expect(save).toHaveBeenCalledWith({ step: 'INTERESTS', tagIds: ['i'] });
  });
  it('öğrenci eşiği kapalı olsa da sunucunun uygulanabilir dediği çok rollü mentor adımını gösterir', () => {
    const multipleRoles = {
      ...initial,
      step: 'MENTOR_PREFERENCE' as const,
      steps: initial.steps.map((item) =>
        item.step === 'MENTOR_PREFERENCE' ? { ...item, applicable: true } : item,
      ),
    };
    renderUi(
      <OnboardingFlow
        initialState={multipleRoles}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    expect(screen.getByRole('button', { name: 'Evet, ilgileniyorum' })).toBeInTheDocument();
  });
  it('boş seçimi kaydetmez, kullanıcıya atlama seçeneğini gösterir', async () => {
    const save = vi.fn();
    const { user } = renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'En az bir seçenek seç veya bu adımı şimdilik atla.',
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('ilgi seçimini kaydeder ve hedef atlamasını ayrı eyleme yollar', async () => {
    const save = vi.fn().mockResolvedValueOnce({
      ok: true,
      data: { ...initial, step: 'GOALS', interestTagIds: ['i'] },
    });
    const skip = vi.fn().mockResolvedValue({ ok: true, data: { ...initial, step: 'VISIBILITY' } });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
        skip={skip}
        saveVisibility={saveVisibility}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Yazılım geliştirme' }));
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(
      await screen.findByRole('heading', { name: 'Birlikte neyi hedefleyelim?' }),
    ).toBeInTheDocument();
    expect(save).toHaveBeenNthCalledWith(1, { step: 'INTERESTS', tagIds: ['i'] });
    await user.click(screen.getByRole('button', { name: 'Şimdilik atla' }));
    expect(skip).toHaveBeenCalledWith({ step: 'GOALS' });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('sunucu hata kodunu metne çevirir ve adımda kalır', async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Yazılım geliştirme' }));
    await user.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('RATE_LIMITED');
    expect(screen.getByRole('heading', { name: 'Neler ilgini çekiyor?' })).toBeInTheDocument();
  });
  it('mentor koşulları sağlanmamışsa tercih düğmelerini göstermez', () => {
    renderUi(
      <OnboardingFlow
        initialState={{ ...initial, step: 'MENTOR_PREFERENCE' }}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Evet, ilgileniyorum' })).not.toBeInTheDocument();
    expect(screen.getByText('Bu adım şu anda kullanılamıyor.')).toBeInTheDocument();
  });
  it('görünürlük ayarını ilgili alan ve seviyeyle kaydeder', async () => {
    const changed = {
      fields: visibility.fields.map((item) =>
        item.field === 'EMAIL' ? { ...item, level: 'PRIVATE' as const, isDefault: false } : item,
      ),
    };
    const update = vi.fn().mockResolvedValue({ ok: true, data: changed });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={{ ...initial, step: 'VISIBILITY' }}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={update}
      />,
    );
    await user.selectOptions(screen.getByLabelText('E-posta'), 'PRIVATE');
    expect(update).toHaveBeenCalledWith({ field: 'EMAIL', level: 'PRIVATE' });
    expect(screen.getByLabelText('E-posta')).toHaveValue('PRIVATE');
  });
  it.each(['MENTOR_PREFERENCE', 'VISIBILITY'] as const)(
    '%s adımını ayrı eylemle atlar',
    async (step) => {
      const skip = vi.fn().mockResolvedValue({ ok: true, data: { ...initial, step: 'COMPLETE' } });
      const eligible = {
        ...initial,
        step,
        studentMentorEligibility: { eligible: true as const, reason: null },
        steps: initial.steps.map((item) =>
          item.step === 'MENTOR_PREFERENCE' ? { ...item, applicable: true } : item,
        ),
      };
      const { user } = renderUi(
        <OnboardingFlow
          initialState={eligible}
          interests={interests}
          goals={goals}
          initialVisibility={{ fields: [...visibility.fields] }}
          save={vi.fn()}
          skip={skip}
          saveVisibility={saveVisibility}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Şimdilik atla' }));
      expect(skip).toHaveBeenCalledWith({ step });
    },
  );
  it('bitirilmiş başlangıca dönen kullanıcı “Son bir adım” değil tamamlandı görünümünü ve eksikleri görür', () => {
    const finishedState: OnboardingState = {
      ...initial,
      step: 'COMPLETE',
      steps: initial.steps.map((item) => ({
        ...item,
        status:
          item.step === 'GOALS' || item.step === 'MENTOR_PREFERENCE' ? 'SKIPPED' : 'COMPLETED',
      })),
      completion: { percent: 75, missing: ['GOALS'] },
    };
    renderUi(
      <OnboardingFlow
        initialState={finishedState}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Hazırsın!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Başlangıcı tamamla' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Eksik kalan adımlar' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Hedefler');
  });
  it('bekleyen adım varken COMPLETE noktası bitirme düğmesini gösterir', () => {
    renderUi(
      <OnboardingFlow
        initialState={{ ...initial, step: 'COMPLETE' }}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Son bir adım' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Başlangıcı tamamla' })).toBeInTheDocument();
  });
  it('etiketler Türkçe adlarına göre sıralanır', () => {
    renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={[
          { id: 'a', kind: 'INTEREST', slug: 'software' },
          { id: 'b', kind: 'INTEREST', slug: 'academic' },
          { id: 'c', kind: 'INTEREST', slug: 'business' },
        ]}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={vi.fn()}
        skip={vi.fn()}
        saveVisibility={saveVisibility}
      />,
    );
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(
      ['Akademik kariyer', 'İş analizi', 'Yazılım geliştirme'],
    );
  });
});
