// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { BackLink } from './back-link';

describe('BackLink', () => {
  it('metni ve hedefi taşır; ok simgesi ekran okuyucudan gizlidir', () => {
    renderUi(<BackLink href="/ilanlar">İlanlara dön</BackLink>);
    const link = screen.getByRole('link', { name: 'İlanlara dön' });
    expect(link).toHaveAttribute('href', '/ilanlar');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dokunma hedefi ≥ 44 px (min-h-11); varsayılan alt boşluk var, flush ile kalkar', () => {
    renderUi(
      <>
        <BackLink href="/a">Varsayılan</BackLink>
        <BackLink href="/b" flush>
          Boşluksuz
        </BackLink>
      </>,
    );
    const normal = screen.getByRole('link', { name: 'Varsayılan' });
    const flush = screen.getByRole('link', { name: 'Boşluksuz' });
    expect(normal).toHaveClass('min-h-11', 'mb-3');
    expect(flush).toHaveClass('min-h-11');
    expect(flush).not.toHaveClass('mb-3');
  });
});
