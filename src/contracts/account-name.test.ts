import { describe, expect, it } from 'vitest';

import { failureFromZod } from '@/lib/action-result';

import {
  ACCOUNT_NAME_LIMITS,
  isValidAccountName,
  normalizeAccountName,
  updateMyNameSchema,
} from './account-name';

const parse = (name: unknown) => updateMyNameSchema.safeParse({ name });

describe('hesap adı doğrulaması', () => {
  it.each([
    'Ayşe Yılmaz',
    'ÖMER ÇAĞRI ŞAHİN',
    'ışıl ğüneş',
    "Dilek O'Brien",
    'Anne-Marie Kaya',
    'Ali Veli Öztürk',
    'Al',
    'Ayşe’nin Kızı',
    'e\u0302\u0303 Aydın',
    'Ayşe'.normalize('NFD'),
  ])('geçerli: %s', (name) => {
    expect(parse(name).success).toBe(true);
  });

  it.each([
    ['ayse yilmaz1989', 'rakam'],
    ['r1', 'rakam'],
    ['ayse.yilmaz@iu.edu.tr', 'e-posta'],
    ['Ayşe_Yılmaz', 'alt çizgi'],
    ['Ayşe Yılmaz!', 'simge'],
    ['Dr. Ayşe', 'nokta'],
    ['A', 'tek harf'],
    ['', 'boş'],
    ['   ', 'yalnız boşluk'],
    ["'Ayşe", 'baştaki kesme'],
    ['Ayşe-', 'sondaki tire'],
    ['Ayşe  - Yılmaz', 'ayraç dizisi'],
    ['😀 Ayşe', 'emoji'],
    ['\u0301\u0301', 'yalnız birleşim işaretleri (görünmez ad)'],
    ['\u0301a', 'sözcük işaretle başlar'],
    ['Ayşe \u0301\u0301', 'ikinci sözcük yalnız işaret'],
    ['\u0301-\u0301', 'işaret-tire-işaret'],
  ])('geçersiz: %s (%s)', (name) => {
    expect(parse(name).success).toBe(false);
  });

  it('sınırlar açık sayılarla sınanır: 2 ve 80 karakter geçer, 1 ve 81 geçmez (kod noktası sayılır)', () => {
    expect(ACCOUNT_NAME_LIMITS).toEqual({ min: 2, max: 80 });
    expect(isValidAccountName('a'.repeat(2))).toBe(true);
    expect(isValidAccountName('a'.repeat(1))).toBe(false);
    expect(isValidAccountName('a'.repeat(80))).toBe(true);
    expect(isValidAccountName('a'.repeat(81))).toBe(false);
    // Kod noktası: birleşik olmayan harfler karakter sayılır, 80 "ş" geçerli, 81 değil.
    expect(isValidAccountName('ş'.repeat(80))).toBe(true);
    expect(isValidAccountName('ş'.repeat(81))).toBe(false);
  });

  it('kırpar, ardışık boşlukları teke indirir ve Unicode birleşik biçime çevirir', () => {
    expect(normalizeAccountName('  Ayşe   \t Yılmaz \n')).toBe('Ayşe Yılmaz');
    const decomposed = 'Ayşe'.normalize('NFD');
    expect(decomposed).not.toBe('Ayşe');
    expect(normalizeAccountName(decomposed)).toBe('Ayşe');
    const parsed = parse('  ayşe   yılmaz ');
    expect(parsed.success && parsed.data.name).toBe('ayşe yılmaz');
    // İki bitişik boşluk da (ve sekme/satır sonu tek başına) teke iner; aksi halde geçerli ad reddedilirdi.
    expect(normalizeAccountName('Ayşe  Yılmaz')).toBe('Ayşe Yılmaz');
    expect(normalizeAccountName('Ayşe\tYılmaz')).toBe('Ayşe Yılmaz');
    expect(parse('Ayşe  Yılmaz').success).toBe(true);
  });

  it('girdide kullanıcı kimliği yoktur: ek alan reddedilir, başkasının adı değiştirilemez', () => {
    expect(updateMyNameSchema.safeParse({ name: 'Ayşe Yılmaz', userId: 'baska' }).success).toBe(
      false,
    );
    expect(updateMyNameSchema.safeParse({ name: 'Ayşe Yılmaz', id: 'baska' }).success).toBe(false);
  });

  it('metin olmayan girdi kararlı hata kodu verir; geçersiz ad alan hatası olarak ACCOUNT_NAME_INVALID döner', () => {
    expect(updateMyNameSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(updateMyNameSchema.safeParse({}).success).toBe(false);
    const result = parse('ayse1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(failureFromZod(result.error)).toEqual({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
        fieldErrors: { name: 'ACCOUNT_NAME_INVALID' },
      });
    }
  });
});
