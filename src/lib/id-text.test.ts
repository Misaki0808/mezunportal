import { describe, expect, it } from 'vitest';
import { hasControlCharacter, idTextSchema, ID_TEXT_MAX_LENGTH } from './id-text';

describe('idTextSchema', () => {
  it('normal kimliği kırpıp kabul eder (uuid, slug, Türkçe harf)', () => {
    const schema = idTextSchema();
    expect(schema.parse('  0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b  ')).toBe(
      '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    );
    expect(schema.parse('ışık-ağacı')).toBe('ışık-ağacı');
  });

  it('boş, yalnız boşluk ve üst sınırı aşan değeri reddeder', () => {
    const schema = idTextSchema();
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('   ').success).toBe(false);
    expect(schema.safeParse('x'.repeat(ID_TEXT_MAX_LENGTH)).success).toBe(true);
    expect(schema.safeParse('x'.repeat(ID_TEXT_MAX_LENGTH + 1)).success).toBe(false);
    expect(idTextSchema('VALIDATION_INVALID', 200).safeParse('x'.repeat(200)).success).toBe(true);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['yalnız NUL', '\u0000'],
    ['ortada satır sonu', 'a\nb'],
    ['ortada sekme', 'a\tb'],
    ['kaçış karakteri', 'a\u001bb'],
    ['DEL', 'a\u007fb'],
    ['C1 denetim karakteri', 'a\u0085b'],
  ])('denetim karakterini reddeder: %s', (_name, value) => {
    expect(hasControlCharacter(value)).toBe(true);
    const result = idTextSchema().safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('VALIDATION_INVALID');
  });

  it('hata kodunu çağıran verir', () => {
    const result = idTextSchema('AUDIT_REASON_INVALID').safeParse('\u0000');
    expect(result.error?.issues[0]?.message).toBe('AUDIT_REASON_INVALID');
  });
});
