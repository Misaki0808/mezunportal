// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OnboardingState } from '@/contracts/profile';
import { CONTACT_FIELDS, DEFAULT_FIELD_VISIBILITY } from '@/contracts/privacy';
import { renderUi } from '@/test/render';
import { OnboardingFlow } from './onboarding-flow';

const initial: OnboardingState = {
  step: 'INTERESTS',
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
  it('ilgi seçimini sunucuya yollar ve hedef adımına geçer; hedef atlama boş seçim yollar', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { ...initial, step: 'GOALS', interestTagIds: ['i'] },
      })
      .mockResolvedValueOnce({ ok: true, data: { ...initial, step: 'VISIBILITY' } });
    const { user } = renderUi(
      <OnboardingFlow
        initialState={initial}
        interests={interests}
        goals={goals}
        initialVisibility={{ fields: [...visibility.fields] }}
        save={save}
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
    expect(save).toHaveBeenNthCalledWith(2, { step: 'GOALS', tagIds: [] });
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
        saveVisibility={saveVisibility}
      />,
    );
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
        saveVisibility={update}
      />,
    );
    await user.selectOptions(screen.getByLabelText('E-posta'), 'PRIVATE');
    expect(update).toHaveBeenCalledWith({ field: 'EMAIL', level: 'PRIVATE' });
    expect(screen.getByLabelText('E-posta')).toHaveValue('PRIVATE');
  });
});
