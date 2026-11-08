// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { PageSkeleton } from './page-skeleton';

describe('PageSkeleton', () => {
  it('durum bölgesi olarak yükleniyor metnini duyurur; iskelet kutuları dekoratiftir', () => {
    const { container } = renderUi(<PageSkeleton cards={2} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Sayfa yükleniyor')).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(4);
    // kart sayısı parametreyle değişir
    expect(container.querySelectorAll('.rounded-card')).toHaveLength(2);
  });
});
