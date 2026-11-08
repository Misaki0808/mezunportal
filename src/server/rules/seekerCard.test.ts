import { describe, expect, it } from 'vitest';
import { headlineForCard } from './seekerCard';
const owner = { name: 'Deniz Işık', email: 'hidden@example.invalid', userId: 'user-secret-unique' };
describe('aday başlığı kimlik koruması', () => {
  it.each([
    'Denizʼin deneyimi',
    'Déniz burada',
    'Dêniz’in profili',
    'denizcilik meraklısı',
    'D e n i z yazıyor',
    'Işıkʼın notları',
    'Isik burada',
    'hidden@example.invalid',
    'user-secret-unique',
    '0532 123 45 67',
    '10000000146',
  ])('%s başlığı kartta hiç yer almaz', (text) => {
    expect(headlineForCard(text, owner)).toBeNull();
  });
  it('kimliksiz başlığı temizler ve korur', () =>
    expect(headlineForCard('  Veri   analizi ilgisi ', owner)).toBe('Veri analizi ilgisi'));
});
