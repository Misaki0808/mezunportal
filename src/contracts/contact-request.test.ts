import { describe, expect, it } from 'vitest';

import { ContactRequestStatus } from '@/generated/prisma/enums';
import { ERROR_CODES } from '@/lib/errors';

import {
  CONTACT_MESSAGE_MAX,
  CONTACT_REQUEST_ACTION_ERRORS,
  CONTACT_REQUEST_STATUSES,
  contactRequestItemSchema,
  listContactRequestsSchema,
  respondToContactRequestSchema,
  sendContactRequestSchema,
} from './contact-request';

const valid = { targetUserId: 'u-hedef', fields: ['EMAIL'] };

describe('iletişim talebi gönder', () => {
  it('durumlar şemadakiyle aynıdır', () => {
    expect([...CONTACT_REQUEST_STATUSES].sort()).toEqual(
      Object.values(ContactRequestStatus).sort(),
    );
  });

  it('en az bir, en fazla dört, tekrarsız alan', () => {
    expect(sendContactRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      sendContactRequestSchema.safeParse({
        ...valid,
        fields: ['EMAIL', 'PHONE', 'SOCIAL_LINKS', 'LINKEDIN'],
      }).success,
    ).toBe(true);
    expect(sendContactRequestSchema.safeParse({ ...valid, fields: [] }).success).toBe(false);
    expect(
      sendContactRequestSchema.safeParse({ ...valid, fields: ['EMAIL', 'EMAIL'] }).success,
    ).toBe(false);
    expect(sendContactRequestSchema.safeParse({ ...valid, fields: ['ADDRESS'] }).success).toBe(
      false,
    );
  });

  it('not: kırpılır, boşsa null olur, 500 karakteri aşamaz', () => {
    expect(sendContactRequestSchema.parse({ ...valid, message: '  Merhaba  ' }).message).toBe(
      'Merhaba',
    );
    expect(sendContactRequestSchema.parse({ ...valid, message: '   ' }).message).toBeNull();
    expect(
      sendContactRequestSchema.safeParse({ ...valid, message: 'a'.repeat(CONTACT_MESSAGE_MAX) })
        .success,
    ).toBe(true);
    expect(
      sendContactRequestSchema.safeParse({ ...valid, message: 'a'.repeat(CONTACT_MESSAGE_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it('istemci durum ya da talep eden kimliği gönderemez (alanlar atılır)', () => {
    const parsed = sendContactRequestSchema.parse({
      ...valid,
      requesterId: 'baskasi',
      status: 'APPROVED',
    });
    expect(parsed).not.toHaveProperty('requesterId');
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('yanıt ve liste', () => {
  it('yalnız onay/ret; ret gerekçesi alanı yok', () => {
    expect(
      respondToContactRequestSchema.safeParse({ requestId: 'r1', decision: 'APPROVE' }).success,
    ).toBe(true);
    expect(
      respondToContactRequestSchema.safeParse({ requestId: 'r1', decision: 'REVOKE' }).success,
    ).toBe(false);
  });

  it('sayfa boyutu 1–50, varsayılan 20', () => {
    expect(listContactRequestsSchema.parse({ box: 'INCOMING' }).limit).toBe(20);
    expect(listContactRequestsSchema.safeParse({ box: 'INCOMING', limit: 51 }).success).toBe(false);
    expect(listContactRequestsSchema.safeParse({ box: 'ALL' }).success).toBe(false);
  });

  const item = {
    id: 'r1',
    counterpart: { userId: 'u2', name: 'Ayşe Yılmaz' },
    origin: null,
    fields: ['EMAIL'],
    message: null,
    status: 'APPROVED',
    createdAt: new Date(),
    decidedAt: new Date(),
    closedAt: null,
    revealed: { EMAIL: 'ayse@ogr.iu.edu.tr' },
  };

  it('karşı taraf yalnız kimlik + ad taşır: e-posta/telefon eklenemez (sızıntı sözleşmede kapalı)', () => {
    expect(contactRequestItemSchema.safeParse(item).success).toBe(true);
    expect(
      contactRequestItemSchema.safeParse({
        ...item,
        counterpart: { ...item.counterpart, email: 'ayse@ogr.iu.edu.tr' },
      }).success,
    ).toBe(false);
    expect(
      contactRequestItemSchema.safeParse({ ...item, revealed: { EMAIL: 'x@y.zz', ADDRESS: 'ev' } })
        .success,
    ).toBe(false);
  });
});

describe('ilan kaynaklı talep (D7): karşı taraf kimliği onaydan önce açılmaz', () => {
  const origin = {
    kind: 'JOB_POSTING',
    title: 'Veri analisti stajyeri',
    organization: 'Örnek Teknoloji',
  };
  const base = {
    id: 'r1',
    fields: ['EMAIL'],
    message: null,
    createdAt: new Date(),
    decidedAt: null,
    closedAt: null,
    revealed: null,
    origin,
  };

  it.each(['PENDING', 'REJECTED', 'WITHDRAWN', 'REVOKED'])(
    '%s: counterpart null + origin dolu geçerli; counterpart dolu da geçerlidir (gelen kutusu)',
    (status) => {
      expect(
        contactRequestItemSchema.safeParse({ ...base, status, counterpart: null }).success,
      ).toBe(true);
      expect(
        contactRequestItemSchema.safeParse({
          ...base,
          status,
          counterpart: { userId: 'u2', name: 'A' },
        }).success,
      ).toBe(true);
    },
  );

  it('APPROVED: counterpart null olamaz (onayda açılır); kaynaksız talepte de null olamaz', () => {
    expect(
      contactRequestItemSchema.safeParse({ ...base, status: 'APPROVED', counterpart: null })
        .success,
    ).toBe(false);
    expect(
      contactRequestItemSchema.safeParse({
        ...base,
        status: 'PENDING',
        origin: null,
        counterpart: null,
      }).success,
    ).toBe(false);
  });

  it('origin yalnız ilan türü, başlık ve kurum taşır (kimlik/ad eklenemez)', () => {
    for (const extra of [{ authorId: 'u1' }, { name: 'Selin' }, { userId: 'u1' }])
      expect(
        contactRequestItemSchema.safeParse({
          ...base,
          status: 'PENDING',
          counterpart: null,
          origin: { ...origin, ...extra },
        }).success,
      ).toBe(false);
  });
});

describe('hata kodları', () => {
  it('eylemlerin bütün olası kodları kayıtlıdır; başkasının talebi yetki hatası değil “bulunamadı” döner', () => {
    for (const code of Object.values(CONTACT_REQUEST_ACTION_ERRORS).flat()) {
      expect(ERROR_CODES).toContain(code);
    }
    for (const codes of [
      CONTACT_REQUEST_ACTION_ERRORS.respondToContactRequest,
      CONTACT_REQUEST_ACTION_ERRORS.withdrawContactRequest,
      CONTACT_REQUEST_ACTION_ERRORS.revokeContactRequest,
    ]) {
      expect(codes).toContain('RESOURCE_NOT_FOUND');
      expect(codes).not.toContain('AUTH_FORBIDDEN');
    }
  });
});

it('onaylı olmayan talep ve istenmeyen alan yanıtta açılamaz', () => {
  const item = {
    id: 'r1',
    counterpart: { userId: 'u2', name: 'Sahte' },
    origin: null,
    fields: ['PHONE'],
    message: null,
    status: 'APPROVED',
    createdAt: new Date(),
    decidedAt: new Date(),
    closedAt: null,
    revealed: { PHONE: 'test-phone' },
  };
  expect(contactRequestItemSchema.safeParse(item).success).toBe(true);
  for (const status of ['PENDING', 'REJECTED', 'WITHDRAWN', 'REVOKED']) {
    expect(contactRequestItemSchema.safeParse({ ...item, status }).success, status).toBe(false);
    expect(
      contactRequestItemSchema.safeParse({ ...item, status, revealed: null }).success,
      status,
    ).toBe(true);
  }
  expect(
    contactRequestItemSchema.safeParse({ ...item, revealed: { EMAIL: 'fake@example.invalid' } })
      .success,
  ).toBe(false);
});
