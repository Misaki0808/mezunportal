// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from './card';
import { PageHeader } from './page-header';

describe('PageHeader (görünüm A)', () => {
  it('üst etiket, tek h1 ve açıklama sırayla gelir; etiket büyük harf ve ana renktir', () => {
    render(<PageHeader eyebrow="Mentorlar" title="Mentor bul" description="Kısa açıklama" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Mentor bul' });
    expect(heading.className).toContain('font-extrabold');
    expect(heading.className).toContain('sm:text-[2.125rem]');
    const eyebrow = screen.getByText('Mentorlar');
    expect(eyebrow.className).toContain('uppercase');
    expect(eyebrow.className).toContain('text-primary');
    expect(
      eyebrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('Kısa açıklama').className).toContain('text-fg-muted');
  });

  it('eylemler başlığın yanında ayrı bir kapsayıcıdadır (bilgisayarda sağda); yoksa kapsayıcı çizilmez', () => {
    const { container, rerender } = render(
      <PageHeader title="Randevular" actions={<button type="button">Yeni</button>} />,
    );
    const button = screen.getByRole('button', { name: 'Yeni' });
    const header = container.querySelector('header')!;
    expect(header.className).toContain('lg:flex-row');
    expect(header.className).toContain('lg:justify-between');
    expect(button.parentElement?.className).toContain('lg:shrink-0');
    expect(header.querySelector('h1')?.parentElement).not.toBe(button.parentElement);
    rerender(<PageHeader title="Randevular" />);
    expect(container.querySelectorAll('header > div')).toHaveLength(1);
  });

  it('başlık sütunu okuma ölçüsüyle sınırlıdır, bütün başlık satırı değil (eylemler en uca gidebilir)', () => {
    const { container } = render(<PageHeader title="X" description="Y" actions={<span>z</span>} />);
    expect(container.querySelector('header')?.className).not.toContain('max-w-');
    expect(container.querySelector('header > div')?.className).toContain('max-w-2xl');
  });

  it('children açıklamanın altında kalır (eski kullanım bozulmaz)', () => {
    render(
      <PageHeader title="X" description="açıklama">
        <p>rozet satırı</p>
      </PageHeader>,
    );
    const note = screen.getByText('rozet satırı');
    expect(
      screen.getByText('açıklama').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('Card (görünüm A)', () => {
  it('kart beyaz yüzey, 16 px köşe ve kart gölgesi taşır', () => {
    render(<Card data-testid="kart">içerik</Card>);
    const card = screen.getByTestId('kart');
    for (const name of ['rounded-card', 'bg-surface', 'shadow-card', 'border-border'])
      expect(card.className).toContain(name);
    expect(card.className).not.toContain('bg-bg');
  });
});
