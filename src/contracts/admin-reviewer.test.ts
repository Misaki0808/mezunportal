import { expect, it } from 'vitest';
import { maskEmail } from '@/lib/mask';
import { maskPhone } from '@/server/rules/maskPhone';
import {
  adminUserSummarySchema,
  adminGrantViewSchema,
  suspendUserSchema,
  unsuspendUserSchema,
  correctMembershipSchema,
  grantAdminSchema,
  revokeAdminSchema,
} from './admin-users';
import {
  deleteDictionaryEntrySchema,
  employmentExportHref,
  resolveUnmatchedValueSchema,
} from './admin';

it('maskeli ad alanı ham e-posta/telefon değeri kabul edemez', () => {
  for (const schema of [
    adminUserSummarySchema.shape.maskedEmail,
    adminGrantViewSchema.shape.maskedEmail,
  ]) {
    expect(schema.safeParse('ayse@example.local').success).toBe(false);
    for (const value of ['ayse@example.local', 'ayse@ogr.example.edu.tr', 'bad'])
      expect(schema.safeParse(maskEmail(value)).success).toBe(true);
  }
  expect(adminUserSummarySchema.shape.maskedPhone.safeParse('+90 532 123 45 67').success).toBe(
    false,
  );
  for (const value of ['05321234567', '12'])
    expect(adminUserSummarySchema.shape.maskedPhone.safeParse(maskPhone(value)).success).toBe(true);
});
it('yıkıcı/yetki değiştiren eylemler açık onay ister', () => {
  const cases = [
    [suspendUserSchema, { userId: 'u', reason: 'Kural ihlali' }],
    [unsuspendUserSchema, { userId: 'u', reason: 'İnceleme tamamlandı' }],
    [
      correctMembershipSchema,
      { membershipId: 'm', reason: 'Yanlış beyan', changes: { entryYear: 2024 } },
    ],
    [grantAdminSchema, { scope: 'SYSTEM', userId: 'u' }],
    [revokeAdminSchema, { grantId: 'g', reason: 'Görev bitti' }],
    [deleteDictionaryEntrySchema, { kind: 'COMPANY', id: 'd', reason: 'Hatalı kayıt' }],
  ] as const;
  for (const [schema, input] of cases) {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, confirmed: false }).success).toBe(false);
    expect(schema.safeParse({ ...input, confirmed: true }).success).toBe(true);
  }
  expect(
    resolveUnmatchedValueSchema.safeParse({ id: 'x', resolution: { type: 'DISMISS' } }).success,
  ).toBe(false);
});
it('askıyı kaldırma da gerekçe ister; sözlük silme gerekçesiz olmaz', () => {
  expect(unsuspendUserSchema.safeParse({ userId: 'u', confirmed: true }).success).toBe(false);
  expect(
    deleteDictionaryEntrySchema.safeParse({ kind: 'COMPANY', id: 'd', confirmed: true }).success,
  ).toBe(false);
});
it('Excel bağlantı yardımcısı şema dışı kişisel filtreleri URL’ye taşımaz', () => {
  expect(() => employmentExportHref({ email: 'private@example.local' } as never)).toThrow();
  expect(employmentExportHref({ departmentId: 'd' })).toContain('departmentId=d');
});
