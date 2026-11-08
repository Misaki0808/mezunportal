import { describe, expect, it } from 'vitest';

import { ConsentDocument, ContactField, VisibilityLevel } from '@/generated/prisma/enums';
import { ERROR_CODES } from '@/lib/errors';

import {
  ACCOUNT_DELETION_EFFECTS,
  CONSENT_DOCUMENTS,
  CONTACT_FIELDS,
  CURRENT_CONSENT_VERSIONS,
  DEFAULT_FIELD_VISIBILITY,
  PRIVACY_ACTION_ERRORS,
  PUBLISHED_CONTENT_CHOICES,
  REQUIRED_CONSENT_DOCUMENTS,
  VISIBILITY_LEVELS,
  consentStateSchema,
  exportedContactRequestSchema,
  consentVersionSchema,
  deleteAccountSchema,
  recordConsentsSchema,
  setFieldVisibilitySchema,
} from './privacy';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('sözleşme ↔ Prisma enum eşitliği', () => {
  it('rıza belgeleri, alanlar ve seviyeler şemadakiyle aynıdır', () => {
    expect([...CONSENT_DOCUMENTS].sort()).toEqual(Object.values(ConsentDocument).sort());
    expect([...CONTACT_FIELDS].sort()).toEqual(Object.values(ContactField).sort());
    expect([...VISIBILITY_LEVELS].sort()).toEqual(Object.values(VisibilityLevel).sort());
  });
});

describe('rıza', () => {
  it('zorunlu belgeler aydınlatma ve kullanım şartlarıdır; yurt dışına aktarım isteğe bağlıdır', () => {
    expect([...REQUIRED_CONSENT_DOCUMENTS].sort()).toEqual(['PRIVACY_NOTICE', 'TERMS_OF_USE']);
    expect(REQUIRED_CONSENT_DOCUMENTS).not.toContain('CROSS_BORDER_TRANSFER');
  });

  it('her belgenin güncel sürümü veritabanı biçimine uyar', () => {
    for (const document of CONSENT_DOCUMENTS) {
      expect(consentVersionSchema.safeParse(CURRENT_CONSENT_VERSIONS[document]).success).toBe(true);
    }
  });

  it.each([[''], ['Taslak-1'], ['-1'], ['taslak 1'], ['a'.repeat(33)], ['taslak_1']])(
    'geçersiz sürüm: %j',
    (version) => {
      expect(consentVersionSchema.safeParse(version).success).toBe(false);
    },
  );

  it('kararlar 1–3 adet ve belge başına tek karar', () => {
    const decision = {
      documentType: 'PRIVACY_NOTICE',
      version: 'taslak-1',
      granted: true,
    } as const;
    expect(recordConsentsSchema.safeParse({ decisions: [decision] }).success).toBe(true);
    expect(firstMessage(recordConsentsSchema.safeParse({ decisions: [] }))).toBe(
      'VALIDATION_INVALID',
    );
    expect(recordConsentsSchema.safeParse({ decisions: [decision, decision] }).success).toBe(false);
    expect(
      recordConsentsSchema.safeParse({
        decisions: [decision, { ...decision, documentType: 'UNKNOWN' }],
      }).success,
    ).toBe(false);
  });

  it('durum çıktısı: belge başına son karar ve kilit bilgisi', () => {
    expect(
      consentStateSchema.safeParse({
        documents: [
          {
            documentType: 'PRIVACY_NOTICE',
            required: true,
            currentVersion: 'taslak-2',
            lastDecision: { version: 'taslak-1', granted: true, decidedAt: new Date() },
            needsAction: true,
          },
        ],
        blocking: true,
      }).success,
    ).toBe(true);
  });
});

describe('alan görünürlüğü', () => {
  it('varsayılan: e-posta ve telefon talep–onayla, sosyal bağlantılar üyelere (docs/security.md)', () => {
    expect(DEFAULT_FIELD_VISIBILITY).toEqual({
      EMAIL: 'ON_APPROVED_REQUEST',
      PHONE: 'ON_APPROVED_REQUEST',
      SOCIAL_LINKS: 'MEMBERS',
      LINKEDIN: 'MEMBERS',
    });
  });

  it('bilinmeyen alan ya da seviye reddedilir', () => {
    expect(setFieldVisibilitySchema.safeParse({ field: 'EMAIL', level: 'PRIVATE' }).success).toBe(
      true,
    );
    expect(setFieldVisibilitySchema.safeParse({ field: 'ADDRESS', level: 'PRIVATE' }).success).toBe(
      false,
    );
    expect(setFieldVisibilitySchema.safeParse({ field: 'EMAIL', level: 'PUBLIC' }).success).toBe(
      false,
    );
  });
});

describe('hesap silme (K-09)', () => {
  it('iki seçenek; seçilmezse varsayılan yayınlanmış içeriği silmektir', () => {
    expect(PUBLISHED_CONTENT_CHOICES).toEqual(['DELETE', 'ANONYMIZE']);
    expect(deleteAccountSchema.parse({ confirmEmail: 'ayse@ogr.iu.edu.tr' }).publishedContent).toBe(
      'DELETE',
    );
    expect(
      deleteAccountSchema.parse({
        confirmEmail: 'ayse@ogr.iu.edu.tr',
        publishedContent: 'ANONYMIZE',
      }).publishedContent,
    ).toBe('ANONYMIZE');
    expect(
      deleteAccountSchema.safeParse({
        confirmEmail: 'ayse@ogr.iu.edu.tr',
        publishedContent: 'KEEP',
      }).success,
    ).toBe(false);
  });

  it('onay e-postası zorunlu ve biçimli', () => {
    expect(firstMessage(deleteAccountSchema.safeParse({}))).toBe('VALIDATION_INVALID');
    expect(deleteAccountSchema.safeParse({ confirmEmail: 'evet' }).success).toBe(false);
  });

  it('her seçeneğin sonuçları açıklanır; ortak sonuçlar oturum, kişisel veri, dosya ve girişi kapsar', () => {
    expect(ACCOUNT_DELETION_EFFECTS.common).toEqual([
      'SESSIONS_ENDED',
      'PERSONAL_DATA_ERASED',
      'FILES_DELETED',
      'SIGN_IN_DISABLED',
    ]);
    for (const choice of PUBLISHED_CONTENT_CHOICES) {
      expect(ACCOUNT_DELETION_EFFECTS[choice].length).toBeGreaterThan(0);
    }
  });
});

describe('hata kodları', () => {
  it('eylemlerin bütün olası kodları kayıtlıdır', () => {
    for (const code of Object.values(PRIVACY_ACTION_ERRORS).flat()) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

it('veri dökümüne karşı tarafın iletişim/kullanıcı nesnesi eklenemez', () => {
  const request = {
    id: 'r1',
    requesterId: 'u1',
    targetId: 'u2',
    origin: null,
    fields: ['EMAIL'],
    message: null,
    status: 'APPROVED',
    createdAt: '2026-11-08T00:00:00Z',
    updatedAt: '2026-11-08T00:00:00Z',
    decidedAt: '2026-11-08T00:00:00Z',
    closedAt: null,
  };
  expect(exportedContactRequestSchema.safeParse(request).success).toBe(true);
  // D7: ilan kaynaklı onaysız giden talepte hedef kimliği null; origin yalnız başlık + kurum (kimlik/ad eklenemez)
  const hidden = {
    ...request,
    status: 'PENDING',
    targetId: null,
    origin: { title: 'İlan', organization: 'Kurum' },
  };
  expect(exportedContactRequestSchema.safeParse(hidden).success).toBe(true);
  expect(
    exportedContactRequestSchema.safeParse({
      ...hidden,
      origin: { title: 'İlan', organization: 'Kurum', authorId: 'u2' },
    }).success,
  ).toBe(false);
  for (const extra of [
    { email: 'other@example.invalid' },
    { target: { email: 'other@example.invalid' } },
    { revealed: { EMAIL: 'other@example.invalid' } },
  ]) {
    expect(exportedContactRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
  }
});
