import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

let department: string;
let user: string;
beforeAll(async () => {
  department = (await createInstitution(db)).deptA1;
  user = await createUser(db);
});
const now = new Date('2031-01-01T10:00:00Z');
const request = (patch: object = {}) =>
  db.faqRequest.create({
    data: {
      askerId: user,
      departmentIdAtWrite: department,
      question: 'Soru metni burada',
      ...patch,
    },
  });

describe('SSS veritabanı değişmezleri', () => {
  it.each([
    ['OPEN karar anı taşıyamaz', { decidedAt: now }],
    ['OPEN not taşıyamaz', { decisionNote: 'Not' }],
    ['PUBLISHED karar anı olmadan', { status: 'PUBLISHED' as const }],
    [
      'PUBLISHED not taşıyamaz',
      { status: 'PUBLISHED' as const, decidedAt: now, decisionNote: 'Not' },
    ],
    ['REJECTED notsuz', { status: 'REJECTED' as const, decidedAt: now }],
    ['REDIRECTED karar anı olmadan', { status: 'REDIRECTED' as const, decisionNote: 'Not' }],
    ['boş soru', { question: '' }],
    ['500 karakteri aşan soru', { question: 'a'.repeat(501) }],
  ])('talep: %s reddedilir', async (_name, patch) => {
    await expect(request(patch)).rejects.toThrow();
  });

  it('geçerli kararlı talepler yazılır', async () => {
    await expect(request({ status: 'PUBLISHED', decidedAt: now })).resolves.toBeTruthy();
    await expect(
      request({ status: 'REJECTED', decidedAt: now, decisionNote: 'Gerekçe' }),
    ).resolves.toBeTruthy();
    await expect(
      request({ status: 'REDIRECTED', decidedAt: now, decisionNote: 'Mentora' }),
    ).resolves.toBeTruthy();
  });

  it('cevap: talep+mentor tek, talepte en çok bir seçilmiş cevap, metin sınırı', async () => {
    const r = await request();
    const mentor = await createUser(db);
    const other = await createUser(db);
    await db.faqAnswer.create({ data: { requestId: r.id, mentorId: mentor, body: 'Cevap bir' } });
    await expect(
      db.faqAnswer.create({
        data: { requestId: r.id, mentorId: mentor, body: 'Aynı mentor ikinci' },
      }),
    ).rejects.toThrow();
    await db.faqAnswer.create({
      data: { requestId: r.id, mentorId: other, body: 'Cevap iki', isSelected: true },
    });
    const third = await createUser(db);
    await expect(
      db.faqAnswer.create({
        data: { requestId: r.id, mentorId: third, body: 'Cevap üç', isSelected: true },
      }),
    ).rejects.toThrow();
    await expect(
      db.faqAnswer.create({ data: { requestId: r.id, mentorId: third, body: '' } }),
    ).rejects.toThrow();
    // kimliği kopmuş (null) birden çok cevap serbest
    await db.faqAnswer.create({ data: { requestId: r.id, mentorId: null, body: 'Kimliksiz bir' } });
    await db.faqAnswer.create({ data: { requestId: r.id, mentorId: null, body: 'Kimliksiz iki' } });
  });

  it('SSS kaydı: talep başına tek kayıt, metin sınırı; arama sütunları üretilir', async () => {
    const r = await request({ status: 'PUBLISHED', decidedAt: now });
    const item = await db.faqItem.create({
      data: {
        sourceRequestId: r.id,
        departmentIdAtWrite: department,
        question: 'Staj Başvurusu İçin Belge',
        answer: 'Özgeçmiş gerekir',
      },
    });
    await expect(
      db.faqItem.create({
        data: {
          sourceRequestId: r.id,
          departmentIdAtWrite: department,
          question: 'q',
          answer: 'a',
        },
      }),
    ).rejects.toThrow();
    const r2 = await request({ status: 'PUBLISHED', decidedAt: now });
    await expect(
      db.faqItem.create({
        data: {
          sourceRequestId: r2.id,
          departmentIdAtWrite: department,
          question: 'q',
          answer: 'a'.repeat(2001),
        },
      }),
    ).rejects.toThrow();
    const rows = await db.$queryRaw<{ keys: string; matches: boolean }[]>`
      SELECT "searchKeys" AS keys, "searchVector" @@ plainto_tsquery('turkish', tr_lower('stajı')) AS matches
      FROM "FaqItem" WHERE "id" = ${item.id}`;
    expect(rows[0]).toEqual({ keys: 'staj basvurusu icin belge', matches: true });
    // talebi olan SSS silinemez (Restrict)
    await expect(db.faqRequest.delete({ where: { id: r.id } })).rejects.toThrow();
  });
});
