// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { Tabs } from './tabs';

const items = [
  { id: 'a', label: 'Hakkında', content: <p>A içeriği</p> },
  { id: 'b', label: 'Deneyim', content: <p>B içeriği</p> },
  { id: 'c', label: 'Eğitim', content: <p>C içeriği</p> },
];

describe('Tabs', () => {
  it('liste adlandırılır; seçili sekme aria-selected ve panelle etiketlidir', () => {
    renderUi(<Tabs label="Profil bölümleri" items={items} />);

    expect(screen.getByRole('tablist', { name: 'Profil bölümleri' })).toBeInTheDocument();
    const selected = screen.getByRole('tab', { name: 'Hakkında' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Hakkında' })).toHaveTextContent('A içeriği');
  });

  it('yalnız seçili sekme sekme sırasındadır (roving tabindex)', () => {
    renderUi(<Tabs label="Profil" items={items} />);

    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveAttribute('tabindex', '-1');
  });

  it('ok tuşları, Home ve End sekmeleri gezer, odağı ve seçimi taşır', async () => {
    const { user } = renderUi(<Tabs label="Profil" items={items} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Deneyim' })).toHaveTextContent('B içeriği');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Eğitim' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Eğitim' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
  });
});
