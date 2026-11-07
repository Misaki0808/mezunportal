import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  ADMIN_ACTIONS,
  findMetadataProblems,
  findReasonProblem,
  isAdminAction,
  isAuditTargetType,
  looksLikePersonalData,
} from './adminAudit';

describe('looksLikePersonalData', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', true],
    ['kullanici@test.mezunportal.local', true],
    ['0532 123 45 67', true],
    ['+90 532 123 45 67', true],
    ['05321234567', true],
    ['532-123-45-67', true],
    ['12345678901', true],
    ['belge sahte görünüyor', false],
    ['019a3c2e-7b3d-7a10-8f21-123456789012', false],
    ['0a1f9c3b5d7e9a1b3c5d7e9f', false],
    ['2026', false],
    ['1234567890', false],
  ])('%s → %s', (text, expected) => {
    expect(looksLikePersonalData(text)).toBe(expected);
  });
});

describe('findMetadataProblems', () => {
  it('kimlik, sayı ve sade değerleri kabul eder', () => {
    expect(
      findMetadataProblems({
        membershipId: '019a3c2e-7b3d-7a10-8f21-123456789012',
        graduationYear: 2026,
        bulk: false,
        previousRole: 'STUDENT',
        ids: ['a', 'b'],
        note: null,
      }),
    ).toEqual([]);
  });

  it.each([
    ['email anahtarı', { email: 'x' }],
    ['userEmail (camelCase)', { userEmail: 'x' }],
    ['phone_number (snake_case)', { phone_number: '1' }],
    ['telefon', { telefon: '1' }],
    ['name', { name: 'Ayşe' }],
    ['fullName', { fullName: 'Ayşe Yılmaz' }],
    ['soyad', { soyad: 'Yılmaz' }],
    ['ad', { ad: 'Ayşe' }],
    ['barkod', { barkod: '123' }],
    ['token', { token: 'abc' }],
    ['e-posta değerli alan', { target: 'ayse@ogr.iu.edu.tr' }],
    ['telefon değerli alan', { target: '0532 123 45 67' }],
    ['dizi içinde e-posta', { ids: ['ok', 'ayse@x.com'] }],
    ['iç içe nesne', { nested: { a: 1 } }],
    ['uzun metin', { text: 'x'.repeat(201) }],
    ['sonsuz sayı', { n: Number.POSITIVE_INFINITY }],
    ['tarih nesnesi', { when: new Date() }],
  ])('%s reddedilir', (_label, metadata) => {
    expect(findMetadataProblems(metadata).length).toBeGreaterThan(0);
  });

  it.each([[null], [[]], ['metin'], [1]])('nesne olmayan metadata (%j) reddedilir', (value) => {
    expect(findMetadataProblems(value).length).toBeGreaterThan(0);
  });

  it('adminId gibi “ad” ile başlayan sözcükler yanlış alarm vermez', () => {
    expect(
      findMetadataProblems({ adminId: 'a', additionalInfoId: 'b', adaptiveMode: true }),
    ).toEqual([]);
  });
});

describe('findReasonProblem', () => {
  it('gerekçe isteyen eylemde boş gerekçe REQUIRED', () => {
    expect(findReasonProblem('DOCUMENT_REJECT', undefined)).toBe('REQUIRED');
    expect(findReasonProblem('USER_SUSPEND', '   ')).toBe('REQUIRED');
    expect(findReasonProblem('MODERATION_REJECT', null)).toBe('REQUIRED');
  });

  it('gerekçe istemeyen eylemde boş gerekçe geçer', () => {
    expect(findReasonProblem('DOCUMENT_APPROVE', undefined)).toBeNull();
    expect(findReasonProblem('ROLE_TRANSITION', '')).toBeNull();
  });

  it('çok kısa, çok uzun ve kişisel veri içeren gerekçe INVALID', () => {
    expect(findReasonProblem('DOCUMENT_REJECT', 'ab')).toBe('INVALID');
    expect(findReasonProblem('DOCUMENT_REJECT', 'x'.repeat(1001))).toBe('INVALID');
    expect(findReasonProblem('DOCUMENT_REJECT', 'ayse@ogr.iu.edu.tr belgesi sahte')).toBe(
      'INVALID',
    );
    expect(findReasonProblem('DOCUMENT_APPROVE', 'ab')).toBe('INVALID');
  });

  it('makul gerekçe geçer', () => {
    expect(findReasonProblem('DOCUMENT_REJECT', 'Barkod doğrulanamadı.')).toBeNull();
  });
});

describe('kayıt', () => {
  it('her eylem bilinir; bilinmeyen eylem ve prototype adları reddedilir', () => {
    for (const action of Object.keys(ADMIN_ACTIONS)) expect(isAdminAction(action)).toBe(true);
    expect(isAdminAction('DROP_TABLE')).toBe(false);
    expect(isAdminAction('toString')).toBe(false);
    expect(isAdminAction('__proto__')).toBe(false);
  });

  it('hedef türleri bilinir', () => {
    expect(isAuditTargetType('MEMBERSHIP')).toBe(true);
    expect(isAuditTargetType('whatever')).toBe(false);
  });
});

describe('kimlik değerlerinde kişisel veri yanlış pozitif regresyonu', () => {
  const identifiers = [
    '90bcfdb7-cab8-4b0b-827e-b62914379546',
    '14578445-7832-7da1-a9b6-3202a38d6c4c',
    'ed2925f1bf00d68392766449',
  ];
  it.each(identifiers)(
    'alt dizisi telefon/kimlik numarasına benzeyen tam kimlik kabul edilir: %s',
    (id) => {
      expect(looksLikePersonalData(id)).toBe(true);
      expect(
        findMetadataProblems({ userId: id, fromMembershipId: id, department_id: id, ids: [id] }),
      ).toEqual([]);
      expect(findMetadataProblems({ note: id })).not.toEqual([]);
      expect(findReasonProblem('ROLE_TRANSITION', id)).toBe('INVALID');
    },
  );
  it.each(['05321234567', '+90 532 123 45 67', '12345678901', 'ayse@example.invalid'])(
    'kimlik anahtarında gerçek kişisel veri biçimi yine reddedilir: %s',
    (value) => {
      expect(findMetadataProblems({ userId: value })).not.toEqual([]);
      expect(findMetadataProblems({ ids: [value] })).not.toEqual([]);
      expect(findReasonProblem('ROLE_TRANSITION', value)).toBe('INVALID');
    },
  );
  it('istisna yalnız tam biçimde ve izinli alan adında işler', () => {
    expect(findMetadataProblems({ userEmailId: identifiers[0] })).not.toEqual([]);
    expect(findMetadataProblems({ userId: 'önek ' + identifiers[0] })).not.toEqual([]);
  });
  it('20.000 deterministik seed kimliğinde yanlış pozitif yoktur', () => {
    for (let i = 0; i < 20000; i++) {
      const id = createHash('sha256')
        .update('audit-review-' + i)
        .digest('hex')
        .slice(0, 24);
      expect(findMetadataProblems({ userId: id }), id).toEqual([]);
    }
  });
});
