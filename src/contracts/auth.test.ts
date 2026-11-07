import { describe, expect, it } from 'vitest';

import { TEST_PERSONAS } from '../../prisma/seed-data';
import { ERROR_CODES } from '@/lib/errors';

import {
  AUTH_ACTION_ERRORS,
  CHECK_EMAIL_RESPONSE,
  ENTRY_YEAR_MIN,
  SIGN_IN_CALLBACK_ERROR_CODES,
  TEST_LOGIN_PERSONAS,
  checkEmailResponseSchema,
  declareMembershipSchema,
  emailSchema,
  requestEmailChangeSchema,
  requestSignInLinkSchema,
  testLoginSchema,
  verificationStateSchema,
} from './auth';

describe('emailSchema', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', 'ayse@ogr.iu.edu.tr'],
    ['  Ayse.Yilmaz@OGR.IU.EDU.TR  ', 'ayse.yilmaz@ogr.iu.edu.tr'],
    ['a+etiket@example.com', 'a+etiket@example.com'],
  ])('%j → %j (kırpılır, küçük harfe çevrilir)', (input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['ayse'],
    ['ayse@'],
    ['@iu.edu.tr'],
    ['ayse@iu'],
    ['ay se@iu.edu.tr'],
    ['ayşe@iu.edu.tr'], // ASCII dışı: homograf/görünmez karakter riski
    ['ayse@iu.edu.tr\r\nBcc: x@y.zz'], // başlık enjeksiyonu
    [`${'a'.repeat(250)}@iu.edu.tr`], // 254 karakteri aşar
    [null],
    [42],
  ])('geçersiz: %j', (input) => {
    const result = emailSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('VALIDATION_INVALID');
  });
});

describe('giriş bağlantısı ve e-posta değiştirme', () => {
  it('geçerli e-postayı normalleştirir; fazladan alanı atar', () => {
    expect(requestSignInLinkSchema.parse({ email: ' A@B.CO ', admin: true })).toEqual({
      email: 'a@b.co',
    });
    expect(requestEmailChangeSchema.parse({ newEmail: 'Yeni@Mail.com' })).toEqual({
      newEmail: 'yeni@mail.com',
    });
  });

  it('tek olası başarılı yanıt “e-postanı kontrol et”tir (kayıtlı/kayıtsız ayrımı yok)', () => {
    expect(CHECK_EMAIL_RESPONSE).toEqual({ status: 'CHECK_EMAIL' });
    expect(checkEmailResponseSchema.safeParse({ status: 'USER_NOT_FOUND' }).success).toBe(false);
    expect(
      checkEmailResponseSchema.safeParse({ status: 'CHECK_EMAIL', registered: true }).success,
    ).toBe(true); // fazladan alan atılır
    expect(
      Object.keys(checkEmailResponseSchema.parse({ status: 'CHECK_EMAIL', registered: true })),
    ).toEqual(['status']);
  });

  it('giriş isteğinin olası hataları kayıt durumunu ele vermez', () => {
    const codes: readonly string[] = AUTH_ACTION_ERRORS.requestSignInLink;
    expect(codes).toEqual(['VALIDATION_INVALID', 'RATE_LIMITED']);
    for (const leaking of [
      'AUTH_ACCOUNT_SUSPENDED',
      'RESOURCE_NOT_FOUND',
      'EMAIL_DOMAIN_NOT_ALLOWED',
    ]) {
      expect(codes).not.toContain(leaking);
    }
  });
});

describe('declareMembershipSchema', () => {
  const thisYear = new Date().getFullYear();

  it('öğrenci: bölüm + giriş yılı zorunlu', () => {
    expect(
      declareMembershipSchema.parse({ role: 'STUDENT', departmentId: 'd1', entryYear: thisYear }),
    ).toEqual({ role: 'STUDENT', departmentId: 'd1', entryYear: thisYear });
    for (const bad of [
      { role: 'STUDENT', departmentId: 'd1' },
      { role: 'STUDENT', departmentId: 'd1', entryYear: ENTRY_YEAR_MIN - 1 },
      { role: 'STUDENT', departmentId: 'd1', entryYear: thisYear + 1 },
      { role: 'STUDENT', departmentId: 'd1', entryYear: 2024.5 },
      { role: 'STUDENT', departmentId: 'd1', entryYear: '2024' },
      { role: 'STUDENT', departmentId: '', entryYear: 2024 },
    ]) {
      expect(declareMembershipSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('giriş yılı sınırları dahil kabul edilir', () => {
    for (const entryYear of [ENTRY_YEAR_MIN, thisYear]) {
      expect(
        declareMembershipSchema.safeParse({ role: 'STUDENT', departmentId: 'd', entryYear })
          .success,
      ).toBe(true);
    }
  });

  it('akademisyen: yalnız bölüm; giriş yılı yok sayılır', () => {
    expect(
      declareMembershipSchema.parse({ role: 'ACADEMIC', departmentId: 'd1', entryYear: 2020 }),
    ).toEqual({ role: 'ACADEMIC', departmentId: 'd1' });
  });

  it('mezun alan adıyla beyan edilemez; bilinmeyen rol reddedilir', () => {
    for (const role of ['ALUMNI', 'ADMIN', 'student', undefined]) {
      expect(
        declareMembershipSchema.safeParse({ role, departmentId: 'd1' }).success,
        String(role),
      ).toBe(false);
    }
  });

  it('istemci doğrulama durumu ya da kullanıcı kimliği gönderemez (alanlar atılır)', () => {
    const parsed = declareMembershipSchema.parse({
      role: 'ACADEMIC',
      departmentId: 'd1',
      userId: 'baskasi',
      verificationStatus: 'VERIFIED',
    });
    expect(parsed).toEqual({ role: 'ACADEMIC', departmentId: 'd1' });
  });
});

describe('test girişi', () => {
  it('kişi anahtarları seed kullanıcılarıyla birebir aynıdır', () => {
    expect([...TEST_LOGIN_PERSONAS].sort()).toEqual(Object.keys(TEST_PERSONAS).sort());
  });

  it('yalnız bilinen kişi kabul edilir', () => {
    expect(testLoginSchema.safeParse({ persona: 'student' }).success).toBe(true);
    for (const persona of ['admin', 'root', '', undefined, 'Student']) {
      expect(testLoginSchema.safeParse({ persona }).success, String(persona)).toBe(false);
    }
  });
});

describe('doğrulama durumu', () => {
  it('örnek durum şemaya uyar (W2 sahte veri üretirken bunu kullanır)', () => {
    const state = {
      status: 'AWAITING_REVIEW',
      emailKind: 'OTHER',
      memberships: [
        {
          id: 'm1',
          departmentId: 'd1',
          departmentName: 'Yönetim Bilişim Sistemleri',
          role: 'ALUMNI',
          verificationStatus: 'PENDING',
        },
      ],
      pendingDocument: {
        id: 'doc1',
        departmentId: 'd1',
        departmentName: 'Yönetim Bilişim Sistemleri',
        graduationYear: 2025,
        submittedAt: new Date(),
      },
      rejection: null,
    };
    expect(verificationStateSchema.safeParse(state).success).toBe(true);
    expect(verificationStateSchema.safeParse({ ...state, status: 'BILINMIYOR' }).success).toBe(
      false,
    );
  });
});

describe('hata kodu kayıtları', () => {
  it('eylemlerin ve geri çağrının bütün kodları kayıtlıdır', () => {
    const all = [...Object.values(AUTH_ACTION_ERRORS).flat(), ...SIGN_IN_CALLBACK_ERROR_CODES];
    for (const code of all) expect(ERROR_CODES).toContain(code);
  });
});
