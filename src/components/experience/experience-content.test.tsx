// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ExperienceDetail } from '@/contracts/experience';
import { renderUi } from '@/test/render';

import { ExperienceContent } from './experience-content';

const rich = {
  type: 'INTERNSHIP',
  organizationName: 'Örnek Yazılım A.Ş.',
  termSeason: 'SUMMER',
  termYear: 2025,
  processSteps: [
    { title: 'Ön eleme', description: 'CV ve kısa form.' },
    { title: 'Teknik mülakat', description: 'Canlı kodlama.' },
  ],
  interviewQuestions: ['Neden bu şirket?', 'Bir projeni anlat.'],
  whatLearned: 'Takım içinde çalışmayı öğrendim.',
  advice: 'Soruları önceden çalış.',
} as unknown as ExperienceDetail['content'];

describe('ExperienceContent (okuma)', () => {
  it('mülakat tüyoları ayrı, zeminli bir kutuda ve numaralı satırlarla öne çıkar', () => {
    renderUi(<ExperienceContent content={rich} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Mülakat tüyoları' });
    const box = heading.closest('section')!;
    expect(box.className).toContain('bg-surface-strong');
    const items = within(box).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '1Neden bu şirket?',
      '2Bir projeni anlat.',
    ]);
  });

  it('süreç adımları numaralıdır; adım başlığı ve açıklaması ayrı satırlardadır', () => {
    renderUi(<ExperienceContent content={rich} />);
    const section = screen.getByRole('heading', { level: 2, name: 'Süreç' }).closest('section')!;
    const steps = within(section).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('1Ön elemeCV ve kısa form.');
    expect(within(steps[1]!).getByText('Teknik mülakat')).toHaveClass('font-semibold');
  });

  it('tavsiye ayrı bir işaretle (sol çizgi) öğrendiklerimden ayrılır; başlık hiyerarşisi h2', () => {
    renderUi(<ExperienceContent content={rich} />);
    const advice = screen.getByRole('heading', { level: 2, name: 'Tavsiyem' }).closest('section')!;
    expect(advice.className).toContain('border-l-4');
    expect(screen.getAllByRole('heading').every((h) => h.tagName === 'H2')).toBe(true);
  });

  it('kurum satırı varsayılan görünür; başlık zaten kurumu söylüyorsa gizlenebilir', () => {
    const { unmount } = renderUi(<ExperienceContent content={rich} />);
    expect(screen.getByText('Kurum')).toBeVisible();
    unmount();
    renderUi(<ExperienceContent content={rich} showOrganization={false} />);
    expect(screen.queryByText('Kurum')).toBeNull();
    // Diğer künye satırları yerinde kalır.
    expect(screen.getByText('Dönem')).toBeVisible();
  });

  it('bölümler yoksa çizilmez (boş kutu bırakmaz)', () => {
    renderUi(
      <ExperienceContent
        content={
          { type: 'INTERNSHIP', organizationName: 'X' } as unknown as ExperienceDetail['content']
        }
      />,
    );
    for (const name of ['Mülakat tüyoları', 'Süreç', 'Tavsiyem', 'Öğrendiklerim'])
      expect(screen.queryByRole('heading', { name })).toBeNull();
  });

  it('split düzeni: künye (şirket yok, dönem) ayrı bir yan kutuda ve etiketli; metin bölümleri solda 70 karakter ölçüsünde', () => {
    const { container } = renderUi(<ExperienceContent content={rich} layout="split" />);
    const facts = screen.getByRole('complementary', { name: 'Künye' });
    expect(within(facts).getByText('Yaz 2025')).toBeInTheDocument();
    expect(facts.className).toContain('lg:sticky');
    // Yan kutu telefonda önce, geniş ekranda sağ sütunda.
    expect(facts.className).toContain('max-lg:order-first');
    const prose = screen.getByRole('heading', { level: 2, name: 'Süreç' }).closest('section')!;
    expect(prose.parentElement!.className).toContain('max-w-[70ch]');
    expect(container.querySelectorAll('aside')).toHaveLength(1);
  });

  it('stacked düzeni (moderasyon kuyruğu) yan kutu çizmez; künye üstte', () => {
    renderUi(<ExperienceContent content={rich} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByText('Yaz 2025')).toBeInTheDocument();
  });
});
