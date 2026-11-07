// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Checkbox } from './checkbox';
import { RadioGroup } from './radio-group';
import { Switch } from './switch';

describe('Checkbox', () => {
  it('etiketi kutuya bağlıdır: etikete tıklamak işaretler', async () => {
    const { user } = renderUi(<Checkbox label="Haberleri al" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Haberleri al' });
    expect(checkbox).not.toBeChecked();
    await user.click(screen.getByText('Haberleri al'));
    expect(checkbox).toBeChecked();
  });
});

describe('Switch', () => {
  it('role="switch" ve aria-checked durumunu taşır', async () => {
    const { user } = renderUi(<Switch label="Müsait değilim" />);

    const toggle = screen.getByRole('switch', { name: 'Müsait değilim' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('klavyeyle (Boşluk) değişir', async () => {
    const { user } = renderUi(<Switch label="Müsait değilim" />);

    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'online', label: 'Çevrim içi' },
    { value: 'in-person', label: 'Yüz yüze' },
  ];

  it('grup legend ile adlandırılır ve seçenekler gruba aittir', () => {
    renderUi(<RadioGroup legend="Görüşme biçimi" name="mode" options={options} />);

    const group = screen.getByRole('group', { name: 'Görüşme biçimi' });
    expect(group).toContainElement(screen.getByRole('radio', { name: 'Çevrim içi' }));
    expect(group).toContainElement(screen.getByRole('radio', { name: 'Yüz yüze' }));
  });

  it('seçimi bildirir; ok tuşlarıyla gezilir', async () => {
    const onValueChange = vi.fn();
    const { user } = renderUi(
      <RadioGroup
        legend="Görüşme biçimi"
        name="mode"
        options={options}
        defaultValue="online"
        onValueChange={onValueChange}
      />,
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Çevrim içi' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(onValueChange).toHaveBeenLastCalledWith('in-person');
    expect(screen.getByRole('radio', { name: 'Yüz yüze' })).toBeChecked();
  });

  it('hata grupla ilişkilidir ve duyurulur', () => {
    renderUi(
      <RadioGroup legend="Görüşme biçimi" name="mode" options={options} error="Bir biçim seç." />,
    );

    const group = screen.getByRole('group', { name: 'Görüşme biçimi' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});
