// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { selectSkillGoal } from '@/server/actions/skill-gap';
vi.mock('@/server/actions/skill-gap', () => ({ selectSkillGoal: vi.fn() }));
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { searchFaqSchema } from '@/contracts/faq';
import { searchExperiencesSchema } from '@/contracts/search';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { SkillGapPanel } from './skill-gap-panel';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it('tek harfli becerinin ilgili içerik bağlantıları geçerli arama sorgusu taşır', () => {
  renderUi(
    <SkillGapPanel
      data={{
        title: { id: 'title', name: 'Analist' },
        analysis: { band: '10+', progress: 0, missing: [{ id: 'r', label: 'R', percent: 50 }] },
      }}
      titles={[{ id: 'title', name: 'Analist' }]}
    />,
  );
  const faq = screen.getByRole('link', { name: 'İlgili sorular' }).getAttribute('href')!;
  const experience = screen.getByRole('link', { name: 'İlgili deneyimler' }).getAttribute('href')!;
  expect(
    searchFaqSchema.safeParse({ q: new URL(faq, 'https://example.test').searchParams.get('q') })
      .success,
  ).toBe(true);
  expect(
    searchExperiencesSchema.safeParse({
      q: new URL(experience, 'https://example.test').searchParams.get('q'),
    }).success,
  ).toBe(true);
  expect(screen.getByRole('link', { name: 'Bu beceri için mentor bul' })).toHaveAttribute(
    'href',
    '/mentorlar?skill=R',
  );
});

it('uzun sözlük adından üretilen bağlantılar arama sınırlarına uyar', () => {
  const label = 'a'.repeat(150);
  renderUi(
    <SkillGapPanel
      data={{
        title: { id: 'title', name: 'Analist' },
        analysis: { band: '10+', progress: 0, missing: [{ id: 'skill', label, percent: 50 }] },
      }}
      titles={[{ id: 'title', name: 'Analist' }]}
    />,
  );
  const param = (name: string, key: string) =>
    new URL(
      screen.getByRole('link', { name }).getAttribute('href')!,
      'https://example.test',
    ).searchParams.get(key);
  expect(searchFaqSchema.safeParse({ q: param('İlgili sorular', 'q') }).success).toBe(true);
  expect(searchExperiencesSchema.safeParse({ q: param('İlgili deneyimler', 'q') }).success).toBe(
    true,
  );
  expect(
    searchMentorsSchema.safeParse({ skill: param('Bu beceri için mentor bul', 'skill') }).success,
  ).toBe(true);
});

it('ağ hatasında seçim korunur ve Türkçe yeniden deneme mesajı gösterilir', async () => {
  const user = userEvent.setup();
  vi.mocked(selectSkillGoal).mockRejectedValueOnce(new Error('network error'));
  renderUi(
    <SkillGapPanel
      data={{ title: null, analysis: null }}
      titles={[{ id: 'title', name: 'Analist' }]}
    />,
  );
  await user.selectOptions(screen.getByRole('combobox'), 'title');
  await user.click(screen.getByRole('button', { name: 'Hedefi kaydet' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('tekrar dene');
  expect(screen.getByRole('combobox')).toHaveValue('title');
  expect(screen.getByRole('button', { name: 'Hedefi kaydet' })).toBeEnabled();
});
