import { describe, expect, it } from 'vitest';

import { MAX_DOCUMENT_BYTES } from '@/contracts/graduation-document';

import nextConfig from '../../next.config';

// Next.js 16 sunucu eylemi gövde sınırı varsayılan 1 MB'dır; 5 MB PDF yüklemek için artırılır.
describe('next.config: sunucu eylemi gövde sınırı', () => {
  it('belge sınırını (5 MB) ve çok parçalı form zarfını karşılar, makul bir üst sınırı aşmaz', () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBe('6mb');
    const bytes = 6 * 1024 * 1024;
    expect(bytes).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    expect(bytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES * 1.25); // gereksiz geniş değil
  });
});
