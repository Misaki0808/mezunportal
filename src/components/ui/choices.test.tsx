// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Checkbox } from './checkbox';
import { Radio } from './radio';
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

describe('Radio', () => {
  it('kit radyosu: yerli çizim kapalı, 24 px, ad/değer/seçili/zorunlu/devre dışı aynen geçer', () => {
    renderUi(
      <>
        <Radio name="grup" value="a" aria-label="Seçenek A" defaultChecked required />
        <Radio name="grup" value="b" aria-label="Seçenek B" disabled />
      </>,
    );

    const a = screen.getByRole('radio', { name: 'Seçenek A' }) as HTMLInputElement;
    const b = screen.getByRole('radio', { name: 'Seçenek B' }) as HTMLInputElement;
    expect(a).toHaveClass('appearance-none', 'size-6', 'border-border-control');
    expect([a.name, a.value, a.checked, a.required]).toEqual(['grup', 'a', true, true]);
    expect([b.name, b.value, b.checked, b.disabled]).toEqual(['grup', 'b', false, true]);
  });

  it('sınıf eklenebilir ama kit çizimini kaldırmaz; ok tuşu gruptaki seçeneği seçer', async () => {
    const { user } = renderUi(
      <>
        <Radio name="g" value="1" aria-label="Bir" className="mt-1" defaultChecked />
        <Radio name="g" value="2" aria-label="İki" />
      </>,
    );
    const one = screen.getByRole('radio', { name: 'Bir' });
    expect(one).toHaveClass('mt-1', 'appearance-none', 'size-6');

    one.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: 'İki' })).toBeChecked();
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

describe('RadioGroup · Radio ile aynı çizim', () => {
  it('seçenek girdileri kit Radio sınıflarını taşır ve seçim davranışı değişmedi', async () => {
    const onValueChange = vi.fn();
    const { user } = renderUi(
      <RadioGroup
        legend="Süre"
        name="sure"
        defaultValue="20"
        onValueChange={onValueChange}
        options={[
          { value: '15', label: '15 dakika' },
          { value: '20', label: '20 dakika' },
        ]}
      />,
    );

    for (const radio of screen.getAllByRole('radio'))
      expect(radio).toHaveClass('appearance-none', 'size-6', 'border-border-control');
    expect(screen.getByRole('radio', { name: '20 dakika' })).toBeChecked();
    await user.click(screen.getByText('15 dakika'));
    expect(onValueChange).toHaveBeenCalledWith('15');
  });
});
