import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import { settleEvents } from './event';
import {
  answerFaqRequest,
  getFaqItem,
  listFaqRequestsForMentor,
  listMyFaqRequests,
  searchFaq,
  submitFaqRequest,
  suggestSimilarFaqs,
} from './faq';
import { listFaqModerationQueue, publishFaq, redirectFaq, rejectFaq } from './faq-moderation';
import { awardForFaq, runPointBackfill } from './points';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
beforeAll(async () => {
  const { seedPointRules } = await import('../../../prisma/seed-points');
  await seedPointRules(db);
});

const deps = { db };
const NAMES = {
  student: 'Elif Demirtaş',
  student2: 'Cem Aksoy',
  mentorA: 'Burak Soylu',
  mentorB: 'Selin Karakaya',
};

type World = Awaited<ReturnType<typeof world>>;
async function world() {
  const inst = await createInstitution(db);
  const make = async (
    role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC',
    name: string,
    departmentId = inst.deptA1,
    options: { mentor?: boolean } = {},
  ) => {
    const userId = await createUser(db, { name });
    await addMembership(
      db,
      role === 'STUDENT'
        ? { userId, departmentId, role, entryYear: 2024 }
        : role === 'ALUMNI'
          ? { userId, departmentId, role, graduationYear: 2020 }
          : { userId, departmentId, role },
    );
    await grantRequiredConsents(db, userId);
    if (options.mentor) await addMentorProfile(db, userId);
    return userId;
  };
  const student = await make('STUDENT', NAMES.student);
  const student2 = await make('STUDENT', NAMES.student2);
  const mentorA = await make('ALUMNI', NAMES.mentorA, inst.deptA1, { mentor: true });
  const mentorB = await make('ALUMNI', NAMES.mentorB, inst.deptA1, { mentor: true });
  const moderator = await make('ACADEMIC', 'Dr. Moderatör Hoca');
  await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  return { inst, make, student, student2, mentorA, mentorB, moderator };
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isCodedError(error) ? error.code : error instanceof Error ? error.name : 'unexpected';
  }
};
const QUESTION = 'Yaz stajı başvurusunda hangi belgeler hazırlanmalıdır';
const ANSWER = 'Güncel özgeçmiş, transkript ve staj başvuru formu genellikle yeterli olur.';

/** Yayınlanmış SSS (moderasyon akışı atlanarak): benzerlik/arama testleri için. */
async function publishedItem(w: World, question: string, answer = ANSWER) {
  const request = await db.faqRequest.create({
    data: {
      askerId: null,
      departmentIdAtWrite: w.inst.deptA1,
      question,
      status: 'PUBLISHED',
      decidedAt: new Date(),
    },
  });
  return db.faqItem.create({
    data: {
      sourceRequestId: request.id,
      departmentIdAtWrite: w.inst.deptA1,
      question,
      answer,
    },
  });
}
/** Bir talep + iki mentor cevabı. */
async function requestWithAnswers(w: World, question = QUESTION) {
  const { requestId } = await submitFaqRequest(deps, w.student, { question });
  const a = await answerFaqRequest(deps, w.mentorA, {
    requestId,
    body: 'Özgeçmiş, transkript ve başvuru formu gerekir; bölümün staj komisyonuna sor.',
  });
  const b = await answerFaqRequest(deps, w.mentorB, {
    requestId,
    body: 'Çoğu firma yalnız özgeçmiş ve transkript ister, formu kurum verir.',
  });
  return { requestId, answerA: a.answerId, answerB: b.answerId };
}
const publishInput = (r: { requestId: string; answerA: string }) => ({
  requestId: r.requestId,
  selectedAnswerId: r.answerA,
  question: 'Yaz stajı başvurusunda hangi belgeler gerekir?',
  answer: 'Genellikle özgeçmiş, transkript ve başvuru formu istenir; kurumun duyurusuna bakın.',
});
const pointsOf = (userId: string) =>
  db.pointEntry.findMany({ where: { userId }, orderBy: { action: 'asc' } });

describe('talep gönderme', () => {
  it('öğrenci talep açar; olay kişisel veri taşımaz; öğrenci olmayan ve kapsam dışı reddedilir', async () => {
    const w = await world();
    const out = await submitFaqRequest(deps, w.student, { question: QUESTION });
    const row = await db.faqRequest.findUniqueOrThrow({ where: { id: out.requestId } });
    expect(row).toMatchObject({
      askerId: w.student,
      departmentIdAtWrite: w.inst.deptA1,
      question: QUESTION,
      status: 'OPEN',
    });
    await settleEvents();
    const events = await db.event.findMany({ where: { userId: w.student, type: 'FAQ_REQUESTED' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.props).toEqual({});
    expect(await code(submitFaqRequest(deps, w.mentorA, { question: QUESTION }))).toBe(
      'AUTH_FORBIDDEN',
    );
    expect(await code(suggestSimilarFaqs(deps, w.mentorA, { text: QUESTION }))).toBe(
      'AUTH_FORBIDDEN',
    );
    const noConsent = await createUser(db, { name: 'Rıza Vermemiş' });
    await addMembership(db, {
      userId: noConsent,
      departmentId: w.inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    expect(await code(submitFaqRequest(deps, noConsent, { question: QUESTION }))).toBe(
      'CONSENT_REQUIRED',
    );
  });

  it('e-posta ve telefon biçimi soruda reddedilir; kısa soru reddedilir; hiçbiri kayıt/sayaç üretmez', async () => {
    const w = await world();
    expect(
      await code(
        submitFaqRequest(deps, w.student, { question: 'Bana ornek@okul.edu.tr yazar mısınız?' }),
      ),
    ).toBe('FAQ_TEXT_PERSONAL_DATA');
    expect(
      await code(
        submitFaqRequest(deps, w.student, { question: 'Beni 0532 123 45 67 numarasından arayın' }),
      ),
    ).toBe('FAQ_TEXT_PERSONAL_DATA');
    expect(await code(submitFaqRequest(deps, w.student, { question: 'kısa' }))).toBe('ZodError');
    expect(await db.faqRequest.count({ where: { askerId: w.student } })).toBe(0);
    for (let i = 0; i < 3; i += 1)
      await submitFaqRequest(deps, w.student, { question: `${QUESTION} ${'x'.repeat(i + 1)}ay` });
  });

  it('günde 3 talep sınırı: dördüncüsü RATE_LIMITED, pencere dolunca yeniden açılır', async () => {
    const w = await world();
    const at = new Date('2031-03-10T10:00:00Z');
    const d = { db, now: () => at };
    for (let i = 0; i < 3; i += 1)
      await submitFaqRequest(d, w.student, {
        question: `Kariyer planı sorusu numara ${i} nasıl yapılır`,
      });
    expect(
      await code(
        submitFaqRequest(d, w.student, { question: 'Dördüncü soru için yeterince uzun metin' }),
      ),
    ).toBe('RATE_LIMITED');
    const next = { db, now: () => new Date(at.getTime() + 24 * 3600_000 + 1) };
    await expect(
      submitFaqRequest(next, w.student, { question: 'Dördüncü soru için yeterince uzun metin' }),
    ).resolves.toBeTruthy();
    // başka öğrencinin sayacı ayrıdır
    await expect(
      submitFaqRequest(d, w.student2, {
        question: 'Bambaşka bir kullanıcı için yeterince uzun soru',
      }),
    ).resolves.toBeTruthy();
  });

  it('reddedilen deneme (benzer SSS kapısı) sayaç tüketmez', async () => {
    const w = await world();
    await publishedItem(w, QUESTION);
    const at = new Date('2031-03-10T10:00:00Z');
    const d = { db, now: () => at };
    for (let i = 0; i < 5; i += 1)
      expect(await code(submitFaqRequest(d, w.student, { question: QUESTION }))).toBe(
        'FAQ_SIMILAR_EXISTS',
      );
    for (let i = 0; i < 3; i += 1)
      await submitFaqRequest(d, w.student, {
        question: QUESTION,
        similarAcknowledged: true,
      }).catch(() => undefined);
    expect(await db.faqRequest.count({ where: { askerId: w.student } })).toBe(3);
  });
});

describe('benzer SSS gönderimden önce', () => {
  it('benzer yayınlanmış SSS önerilir; onaysız gönderim engellenir, onayla geçer; alakasız soru engellenmez', async () => {
    const w = await world();
    const item = await publishedItem(w, QUESTION);
    await publishedItem(w, 'Mezuniyet töreni için hangi kıyafet uygundur nasıl seçilir');
    const suggestions = await suggestSimilarFaqs(deps, w.student, {
      text: 'Yaz stajı başvurusu için hangi belgeler hazırlanmalı',
    });
    expect(suggestions.map((s) => s.id)).toEqual([item.id]);
    expect(suggestions[0]).toEqual({ id: item.id, question: QUESTION });
    expect(await code(submitFaqRequest(deps, w.student, { question: QUESTION }))).toBe(
      'FAQ_SIMILAR_EXISTS',
    );
    expect(await db.faqRequest.count({ where: { askerId: w.student } })).toBe(0);
    await expect(
      submitFaqRequest(deps, w.student, { question: QUESTION, similarAcknowledged: true }),
    ).resolves.toBeTruthy();
    await expect(
      submitFaqRequest(deps, w.student2, {
        question: 'Yurt dışında erasmus değişim programına nasıl başvurulur öğrenmek istiyorum',
      }),
    ).resolves.toBeTruthy();
  });

  it('öneri en çok 5 sonuç verir; başka üniversitenin SSS’si önerilmez ve kapıyı kapatmaz (K-07)', async () => {
    const w = await world();
    for (let i = 0; i < 7; i += 1) await publishedItem(w, `${QUESTION} sürecinde ${i}`);
    expect((await suggestSimilarFaqs(deps, w.student, { text: QUESTION })).length).toBe(5);
    const other = await world();
    expect(await suggestSimilarFaqs(deps, other.student, { text: QUESTION })).toEqual([]);
    await expect(
      submitFaqRequest(deps, other.student, { question: QUESTION }),
    ).resolves.toBeTruthy();
  });

  it('öneri isteği saatte 60 ile sınırlıdır', async () => {
    const w = await world();
    const at = new Date('2031-04-10T10:00:00Z');
    const d = { db, now: () => at };
    for (let i = 0; i < 60; i += 1) await suggestSimilarFaqs(d, w.student, { text: QUESTION });
    expect(await code(suggestSimilarFaqs(d, w.student, { text: QUESTION }))).toBe('RATE_LIMITED');
  });
});

describe('mentor cevapları', () => {
  it('mentor açık talepleri soran kimliği olmadan görür; kendi cevabı dışını görmez; kapsam ve durum süzülür', async () => {
    const w = await world();
    const { requestId, answerA, answerB } = await requestWithAnswers(w);
    const listA = await listFaqRequestsForMentor(deps, w.mentorA, {});
    expect(listA.items).toHaveLength(1);
    expect(listA.items[0]).toMatchObject({ id: requestId, question: QUESTION });
    expect(listA.items[0]!.myAnswer?.id).toBe(answerA);
    const text = JSON.stringify(listA);
    for (const secret of [w.student, NAMES.student, w.mentorB, NAMES.mentorB, 'Burak'])
      if (secret !== 'Burak') expect(text).not.toContain(secret);
    expect(listA.items[0]!.myAnswer!.body).not.toContain('Çoğu firma');
    // her mentor yalnız KENDİ cevabını görür
    const listB = await listFaqRequestsForMentor(deps, w.mentorB, {});
    expect(listB.items[0]!.myAnswer!.id).toBe(answerB);
    expect(listB.items[0]!.myAnswer!.body).toContain('Çoğu firma');
    expect(listB.items[0]!.myAnswer!.body).not.toContain('staj komisyonuna');
    // cevaplanmamış süzgeci
    expect(
      (await listFaqRequestsForMentor(deps, w.mentorA, { onlyUnanswered: true })).items,
    ).toEqual([]);
    const third = await w.make('ALUMNI', 'Deniz Yıldırım', w.inst.deptA1, { mentor: true });
    expect(
      (await listFaqRequestsForMentor(deps, third, { onlyUnanswered: true })).items,
    ).toHaveLength(1);
    // başka üniversitenin mentoru görmez
    const other = await world();
    expect((await listFaqRequestsForMentor(deps, other.mentorA, {})).items).toEqual([]);
    // karar verilmiş talep listeden düşer
    await db.faqRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', decisionNote: 'Uygun değil', decidedAt: new Date() },
    });
    expect((await listFaqRequestsForMentor(deps, w.mentorA, {})).items).toEqual([]);
  });

  it('cevap güncellenir (talep başına tek cevap); eşzamanlı çift gönderim tek satır; kişisel veri ve yetki reddedilir', async () => {
    const w = await world();
    const { requestId } = await submitFaqRequest(deps, w.student, { question: QUESTION });
    const body1 = 'İlk cevap: transkript ve özgeçmiş yeterli olur genellikle.';
    const [r1, r2] = await Promise.all([
      answerFaqRequest(deps, w.mentorA, { requestId, body: body1 }),
      answerFaqRequest(deps, w.mentorA, { requestId, body: body1 }),
    ]);
    expect(r1.answerId).toBe(r2.answerId);
    expect(await db.faqAnswer.count({ where: { requestId } })).toBe(1);
    const updated = await answerFaqRequest(deps, w.mentorA, {
      requestId,
      body: 'Güncellenmiş cevap: ayrıca referans mektubu da hazırlayın.',
    });
    expect(updated.answerId).toBe(r1.answerId);
    expect((await db.faqAnswer.findUniqueOrThrow({ where: { id: r1.answerId } })).body).toContain(
      'Güncellenmiş',
    );
    expect(
      await code(
        answerFaqRequest(deps, w.mentorB, {
          requestId,
          body: 'Bana ornek@okul.edu.tr yazın lütfen.',
        }),
      ),
    ).toBe('FAQ_TEXT_PERSONAL_DATA');
    expect(await code(answerFaqRequest(deps, w.student2, { requestId, body: body1 }))).toBe(
      'AUTH_FORBIDDEN',
    );
    const other = await world();
    expect(await code(answerFaqRequest(deps, other.mentorA, { requestId, body: body1 }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    expect(await code(answerFaqRequest(deps, w.mentorB, { requestId: 'yok', body: body1 }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    await db.faqRequest.update({
      where: { id: requestId },
      data: { status: 'REDIRECTED', decisionNote: 'Mentora', decidedAt: new Date() },
    });
    expect(await code(answerFaqRequest(deps, w.mentorA, { requestId, body: body1 }))).toBe(
      'FAQ_REQUEST_CLOSED',
    );
  });

  it('kendi sorusuna cevap yazılamaz ve kendi talebi mentör listesinde çıkmaz', async () => {
    const w = await world();
    const request = await db.faqRequest.create({
      data: { askerId: w.mentorA, departmentIdAtWrite: w.inst.deptA1, question: QUESTION },
    });
    expect(
      await code(
        answerFaqRequest(deps, w.mentorA, {
          requestId: request.id,
          body: 'Kendi sorumu kendim cevaplıyorum, puan için.',
        }),
      ),
    ).toBe('FAQ_OWN_REQUEST');
    expect((await listFaqRequestsForMentor(deps, w.mentorA, {})).items).toEqual([]);
    expect((await listFaqRequestsForMentor(deps, w.mentorB, {})).items).toHaveLength(1);
  });

  it('cevap yazmak puan üretmez (puan yalnız yayında)', async () => {
    const w = await world();
    await requestWithAnswers(w);
    expect(await pointsOf(w.mentorA)).toEqual([]);
    expect(await pointsOf(w.student)).toEqual([]);
  });
});

describe('yayında ad ÖNEKİ uyarısı (kart 122): engel değil, moderatör onayı + işlem kaydı', () => {
  const warned = (r: Awaited<ReturnType<typeof requestWithAnswers>>) => ({
    ...publishInput(r),
    answer: `${publishInput(r).answer} Selinay gibi sektörlerde de aynı belgeler istenir.`,
  });
  const lastError = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error) {
      return isCodedError(error) ? error : error;
    }
  };

  it('onaysız: FAQ_IDENTITY_WARNING + eşleşen sözcük; hiçbir şey yazılmaz', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    for (const input of [warned(r), { ...warned(r), confirmNotPersonal: false }]) {
      const error = await lastError(publishFaq(deps, w.moderator, input));
      expect(error).toMatchObject({ code: 'FAQ_IDENTITY_WARNING', params: { matches: 'Selinay' } });
    }
    expect(await db.faqItem.count({ where: { sourceRequestId: r.requestId } })).toBe(0);
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).status).toBe(
      'OPEN',
    );
    expect(await db.adminAuditLog.count({ where: { targetId: r.requestId } })).toBe(0);
    expect(await pointsOf(w.student)).toEqual([]);
  });

  it('onaylı: yayınlanır; işlem kaydı sabit gerekçe + sayı taşır, sözcük taşımaz; puanlar yazılır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const out = await publishFaq(deps, w.moderator, { ...warned(r), confirmNotPersonal: true });
    expect(out.faqItemId).toBeTruthy();
    const logs = await db.adminAuditLog.findMany({ where: { targetId: r.requestId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'MODERATION_PUBLISH',
      reason: 'Ad önekiyle eşleşen sözcük kişisel bilgi değil, yayımlandı',
      metadata: { answerCount: 2, identityWarningConfirmed: true, warnedWordCount: 1 },
    });
    expect(JSON.stringify(logs[0])).not.toContain('Selinay');
    expect((await pointsOf(w.student)).length).toBeGreaterThan(0);
  });

  it('onay, engeli AŞMAZ: adın tam/ekli hali ve kişisel veri onayla da reddedilir (uyarı + engel birlikteyse de)', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    for (const answer of [
      `${publishInput(r).answer} Selin'in önerisi.`,
      `${publishInput(r).answer} Selinay ve Burak önerdi.`,
      `${publishInput(r).answer} Selinay: ornek@okul.edu.tr`,
    ])
      expect(
        await code(
          publishFaq(deps, w.moderator, { ...publishInput(r), answer, confirmNotPersonal: true }),
        ),
      ).toBe('FAQ_IDENTITY_LEAK');
    expect(await db.faqItem.count({ where: { sourceRequestId: r.requestId } })).toBe(0);
  });

  it('kesmesiz ekli ad ("Selinin") uyarıdır, kesmeli ("Selin\'in") engeldir; onayla yalnız uyarı geçer', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const base = publishInput(r);
    const kesmesiz = { ...base, answer: `${base.answer} Selinin dediğine göre yeterli olur.` };
    const error = await lastError(publishFaq(deps, w.moderator, kesmesiz));
    expect(error).toMatchObject({ code: 'FAQ_IDENTITY_WARNING', params: { matches: 'Selinin' } });
    expect(
      await code(
        publishFaq(deps, w.moderator, {
          ...base,
          answer: `${base.answer} Selin'in dediğine göre yeterli olur.`,
          confirmNotPersonal: true,
        }),
      ),
    ).toBe('FAQ_IDENTITY_LEAK');
    await publishFaq(deps, w.moderator, { ...kesmesiz, confirmNotPersonal: true });
    expect(await db.faqItem.count({ where: { sourceRequestId: r.requestId } })).toBe(1);
  });

  it('uyarı yokken onay bayrağı işlem kaydına yansımaz; soru metnindeki önek de uyarır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    await publishFaq(deps, w.moderator, { ...publishInput(r), confirmNotPersonal: true });
    const [log] = await db.adminAuditLog.findMany({ where: { targetId: r.requestId } });
    expect(log).toMatchObject({ reason: null, metadata: { answerCount: 2 } });
    expect(log!.metadata).not.toHaveProperty('identityWarningConfirmed');

    const w2 = await world();
    const r2 = await requestWithAnswers(w2);
    expect(
      await code(
        publishFaq(deps, w2.moderator, {
          ...publishInput(r2),
          question: 'Selinay stajı için hangi belgeler gerekir?',
        }),
      ),
    ).toBe('FAQ_IDENTITY_WARNING');
  });
});

describe('inceleyici: yayında moderatör ve parçalanmış kimlikler', () => {
  it('moderatör adı, görünmez karakterle bölünmüş ad ve katılımcı kimliği reddedilir', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    for (const leak of [
      'Moderatör önerdi',
      'Bu\u200brak önerdi',
      w.student,
      w.mentorA,
      w.moderator,
      r.requestId,
      r.answerA,
      r.answerB,
    ]) {
      expect(
        await code(publishFaq(deps, w.moderator, { ...publishInput(r), answer: `Yanıt: ${leak}` })),
      ).toBe('FAQ_IDENTITY_LEAK');
    }
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).status).toBe(
      'OPEN',
    );
  });
});

describe('inceleyici: rızasız moderatör', () => {
  it('doğrudan kuyruk, yayın, ret ve yönlendirme çağrıları reddedilir', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const admin = await createUser(db, { name: 'Rızasız Görevli' });
    await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: w.inst.deptA1 });
    await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: w.inst.deptA1 });
    expect(await code(listFaqModerationQueue(deps, admin, {}))).toBe('CONSENT_REQUIRED');
    expect(await code(publishFaq(deps, admin, publishInput(r)))).toBe('CONSENT_REQUIRED');
    expect(
      await code(rejectFaq(deps, admin, { requestId: r.requestId, reason: 'Uygun değil' })),
    ).toBe('CONSENT_REQUIRED');
    expect(
      await code(redirectFaq(deps, admin, { requestId: r.requestId, note: 'Mentorla görüş' })),
    ).toBe('CONSENT_REQUIRED');
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).status).toBe(
      'OPEN',
    );
  });
});

describe('moderasyon: yayın', () => {
  it('kuyruk kapsamlıdır ve kimliksizdir; yayın düzenlenmiş metni yazar, puanlar 2/5/1 ve tek kez yazılır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const queue = await listFaqModerationQueue(deps, w.moderator, {});
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]!.answers.map((a) => a.id).sort()).toEqual([r.answerA, r.answerB].sort());
    const queueText = JSON.stringify(queue);
    for (const secret of [w.student, w.mentorA, w.mentorB, ...Object.values(NAMES)])
      expect(queueText).not.toContain(secret);
    // kapsam dışı moderatör kuyruğu boş görür, yayınlayamaz
    const outOfScope = await w.make('ACADEMIC', 'Dr. Başka Bölüm', w.inst.deptA2);
    await addGrant(db, { userId: outOfScope, scope: 'DEPARTMENT', departmentId: w.inst.deptA2 });
    expect((await listFaqModerationQueue(deps, outOfScope, {})).items).toEqual([]);
    expect(await code(publishFaq(deps, outOfScope, publishInput(r)))).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(publishFaq(deps, outOfScope, { ...publishInput(r), requestId: 'missing' })),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(await code(publishFaq(deps, w.student, publishInput(r)))).toBe('AUTH_FORBIDDEN');

    const out = await publishFaq(deps, w.moderator, publishInput(r));
    const item = await db.faqItem.findUniqueOrThrow({ where: { id: out.faqItemId } });
    expect(item).toMatchObject({
      sourceRequestId: r.requestId,
      question: publishInput(r).question,
      answer: publishInput(r).answer,
      departmentIdAtWrite: w.inst.deptA1,
      publishedById: w.moderator,
    });
    expect(await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).toMatchObject({
      status: 'PUBLISHED',
      decidedById: w.moderator,
      decisionNote: null,
    });
    expect((await db.faqAnswer.findUniqueOrThrow({ where: { id: r.answerA } })).isSelected).toBe(
      true,
    );
    expect((await db.faqAnswer.findUniqueOrThrow({ where: { id: r.answerB } })).isSelected).toBe(
      false,
    );
    expect(await db.adminAuditLog.findMany({ where: { targetId: r.requestId } })).toMatchObject([
      { actorId: w.moderator, action: 'MODERATION_PUBLISH', targetType: 'FAQ_REQUEST' },
    ]);
    // puanlar: soran 2, seçilen 5, seçilmeyen 1 — kaynak/karşı taraf bağı yok
    expect(await pointsOf(w.student)).toMatchObject([
      { action: 'FAQ_QUESTION_PUBLISHED', points: 2, counterpartId: null, sourceId: r.requestId },
    ]);
    expect(await pointsOf(w.mentorA)).toMatchObject([
      { action: 'FAQ_ANSWER_SELECTED', points: 5, counterpartId: null, sourceId: r.answerA },
    ]);
    expect(await pointsOf(w.mentorB)).toMatchObject([
      { action: 'FAQ_ANSWER_PARTICIPATION', points: 1, counterpartId: null, sourceId: r.answerB },
    ]);
    // ikinci yayın reddedilir; puan çoğalmaz
    expect(await code(publishFaq(deps, w.moderator, publishInput(r)))).toBe('FAQ_REQUEST_CLOSED');
    expect((await pointsOf(w.mentorA)).length + (await pointsOf(w.student)).length).toBe(2);
    await settleEvents();
    expect(await db.event.count({ where: { userId: w.student, type: 'FAQ_PUBLISHED' } })).toBe(1);
  });

  it('bildirimler outbox’a yazılır: soran ve her cevap yazan; yük yalnız kimlik/olay taşır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    await publishFaq(deps, w.moderator, publishInput(r));
    const intents = await db.notificationIntent.findMany({
      where: { userId: { in: [w.student, w.mentorA, w.mentorB] } },
    });
    const byUser = Object.fromEntries(intents.map((i) => [i.userId, i.payload]));
    expect(byUser[w.student]).toEqual({
      type: 'generic',
      event: 'faqPublished',
      eventId: r.requestId,
      path: '/hesap/sss',
    });
    expect(byUser[w.mentorA]).toMatchObject({ event: 'faqAnswerPublished', eventId: r.answerA });
    expect(byUser[w.mentorB]).toMatchObject({ event: 'faqAnswerPublished', eventId: r.answerB });
    const text = JSON.stringify(intents);
    expect(text).not.toContain('@');
    expect(text).not.toContain(QUESTION);
  });

  it('yayın metninde soran ya da cevap yazanın adı, e-posta ve telefon biçimi varsa reddedilir; hiçbir şey değişmez', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const leaks = [
      { question: 'Elif için staj belgeleri nelerdir diye sordum' },
      { answer: 'Burak Soylu ile konuşun, sana yardım eder.' },
      { answer: 'Selin hanıma sorun; özgeçmiş ve transkript yeterli olur.' },
      { answer: 'Bana ornek@okul.edu.tr adresinden yazın, hepsini anlatayım.' },
      { answer: 'Beni 0532 123 45 67 numarasından arayın, anlatayım hepsini.' },
    ];
    for (const patch of leaks)
      expect(await code(publishFaq(deps, w.moderator, { ...publishInput(r), ...patch }))).toBe(
        'FAQ_IDENTITY_LEAK',
      );
    expect(await db.faqItem.count({ where: { sourceRequestId: r.requestId } })).toBe(0);
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).status).toBe(
      'OPEN',
    );
    expect(await pointsOf(w.student)).toEqual([]);
    expect(await db.notificationIntent.count({ where: { userId: w.student } })).toBe(0);
    // temiz metin geçer (başka kullanıcıların adı sızıntı sayılmaz)
    await expect(publishFaq(deps, w.moderator, publishInput(r))).resolves.toBeTruthy();
  });

  it('başka talebin cevabıyla yayın ve bilinmeyen talep/cevap reddedilir', async () => {
    const w = await world();
    const r1 = await requestWithAnswers(w);
    const r2 = await requestWithAnswers(
      w,
      'Mülakatta en sık sorulan teknik sorular nelerdir hazırlık için',
    );
    expect(
      await code(
        publishFaq(deps, w.moderator, { ...publishInput(r1), selectedAnswerId: r2.answerA }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(publishFaq(deps, w.moderator, { ...publishInput(r1), requestId: 'yok' })),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(publishFaq(deps, w.moderator, { ...publishInput(r1), selectedAnswerId: 'yok' })),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('eşzamanlı iki yayından yalnız biri uygulanır; puan çift yazılmaz', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const results = await Promise.all([
      code(publishFaq(deps, w.moderator, publishInput(r))),
      code(publishFaq(deps, w.moderator, { ...publishInput(r), selectedAnswerId: r.answerB })),
    ]);
    expect(results.filter((x) => x === null)).toHaveLength(1);
    expect(results.filter((x) => x === 'FAQ_REQUEST_CLOSED')).toHaveLength(1);
    expect(await db.faqItem.count({ where: { sourceRequestId: r.requestId } })).toBe(1);
    expect(await db.faqAnswer.count({ where: { requestId: r.requestId, isSelected: true } })).toBe(
      1,
    );
    const all = [
      ...(await pointsOf(w.student)),
      ...(await pointsOf(w.mentorA)),
      ...(await pointsOf(w.mentorB)),
    ];
    expect(all.map((p) => p.points).sort()).toEqual([1, 2, 5]);
  });

  it('cevapsız talep yayınlanamaz (seçilecek cevap yok)', async () => {
    const w = await world();
    const { requestId } = await submitFaqRequest(deps, w.student, { question: QUESTION });
    expect(
      await code(
        publishFaq(deps, w.moderator, {
          requestId,
          selectedAnswerId: 'yok',
          question: publishInput({ requestId, answerA: 'x' }).question,
          answer: publishInput({ requestId, answerA: 'x' }).answer,
        }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('moderasyon: ret ve yönlendirme', () => {
  it('ret gerekçesi soran öğrenciye görünür; puan yazılmaz; işlem kaydı ve bildirim yazılır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    expect(await code(rejectFaq(deps, w.moderator, { requestId: r.requestId, reason: 'x' }))).toBe(
      'ZodError',
    );
    const out = await rejectFaq(deps, w.moderator, {
      requestId: r.requestId,
      reason: 'Soru çok genel ve tekrar niteliğinde.',
    });
    expect(out).toEqual({ requestId: r.requestId, status: 'REJECTED' });
    const mine = await listMyFaqRequests(deps, w.student, {});
    expect(mine.items[0]).toMatchObject({
      id: r.requestId,
      status: 'REJECTED',
      decisionNote: 'Soru çok genel ve tekrar niteliğinde.',
      faqItemId: null,
      directoryHref: null,
    });
    expect(mine.items[0]!.decidedAt).toBeInstanceOf(Date);
    expect(await pointsOf(w.student)).toEqual([]);
    expect(await pointsOf(w.mentorA)).toEqual([]);
    expect(await db.adminAuditLog.findMany({ where: { targetId: r.requestId } })).toMatchObject([
      {
        action: 'MODERATION_REJECT',
        targetType: 'FAQ_REQUEST',
        reason: 'Soru çok genel ve tekrar niteliğinde.',
      },
    ]);
    expect(
      (await db.notificationIntent.findFirstOrThrow({ where: { userId: w.student } })).payload,
    ).toMatchObject({
      event: 'faqRejected',
    });
    expect(
      await code(rejectFaq(deps, w.moderator, { requestId: r.requestId, reason: 'Tekrar' })),
    ).toBe('FAQ_REQUEST_CLOSED');
    expect(await code(publishFaq(deps, w.moderator, publishInput(r)))).toBe('FAQ_REQUEST_CLOSED');
  });

  it('yönlendirilen öğrenci mentor dizini bağlantısını görür; yetkisiz ve kapsam dışı reddedilir', async () => {
    const w = await world();
    const { requestId } = await submitFaqRequest(deps, w.student, { question: QUESTION });
    const note = 'Bu soru kişisel; bir mentorla birebir görüşmeni öneririz.';
    expect(await code(redirectFaq(deps, w.student, { requestId, note }))).toBe('AUTH_FORBIDDEN');
    const outOfScope = await w.make('ACADEMIC', 'Dr. Başka Bölüm', w.inst.deptA2);
    await addGrant(db, { userId: outOfScope, scope: 'DEPARTMENT', departmentId: w.inst.deptA2 });
    expect(await code(redirectFaq(deps, outOfScope, { requestId, note }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe(
      'OPEN',
    );
    await redirectFaq(deps, w.moderator, { requestId, note });
    const mine = await listMyFaqRequests(deps, w.student, {});
    expect(mine.items[0]).toMatchObject({
      status: 'REDIRECTED',
      decisionNote: note,
      directoryHref: '/mentorlar',
    });
    expect(await db.adminAuditLog.findMany({ where: { targetId: requestId } })).toMatchObject([
      { action: 'MODERATION_REDIRECT', reason: note },
    ]);
    expect(
      (await db.notificationIntent.findFirstOrThrow({ where: { userId: w.student } })).payload,
    ).toMatchObject({
      event: 'faqRedirected',
    });
  });

  it('kendi taleplerim yalnız sahibine görünür ve sayfalanır', async () => {
    const w = await world();
    for (let i = 0; i < 3; i += 1)
      await db.faqRequest.create({
        data: {
          askerId: w.student,
          departmentIdAtWrite: w.inst.deptA1,
          question: `${QUESTION} ${i}`,
        },
      });
    await db.faqRequest.create({
      data: {
        askerId: w.student2,
        departmentIdAtWrite: w.inst.deptA1,
        question: 'Başkasının sorusu burada',
      },
    });
    const page1 = await listMyFaqRequests(deps, w.student, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    const page2 = await listMyFaqRequests(deps, w.student, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(JSON.stringify([page1, page2])).not.toContain('Başkasının');
    expect(await code(listMyFaqRequests(deps, w.mentorA, {}))).toBe('AUTH_FORBIDDEN');
  });
});

describe('SSS sayfası ve araması (kimliksiz, K-07)', () => {
  it('yayın çıktıları ve arama sonucu hiçbir isim/kimlik taşımaz', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const { faqItemId } = await publishFaq(deps, w.moderator, publishInput(r));
    const found = await searchFaq(deps, w.mentorB, {});
    const detail = await getFaqItem(deps, w.student2, { id: faqItemId });
    const text = JSON.stringify([found, detail]);
    for (const secret of [
      w.student,
      w.mentorA,
      w.mentorB,
      w.moderator,
      r.requestId,
      r.answerA,
      r.answerB,
      ...Object.values(NAMES),
      'Moderatör',
    ])
      expect(text).not.toContain(secret);
    expect(found.items).toHaveLength(1);
    expect(Object.keys(found.items[0]!).sort()).toEqual([
      'answer',
      'id',
      'publishedAt',
      'question',
    ]);
    expect(detail.answer).toBe(publishInput(r).answer);
  });

  it('başka üniversitenin üyesi göremez; üyeliksiz kullanıcı reddedilir', async () => {
    const w = await world();
    const item = await publishedItem(w, QUESTION);
    const other = await world();
    expect((await searchFaq(deps, other.student, {})).items).toEqual([]);
    expect(await code(getFaqItem(deps, other.student, { id: item.id }))).toBe('RESOURCE_NOT_FOUND');
    expect(await code(getFaqItem(deps, w.student, { id: 'yok' }))).toBe('RESOURCE_NOT_FOUND');
    const stranger = await createUser(db);
    await grantRequiredConsents(db, stranger);
    expect(await code(searchFaq(deps, stranger, {}))).toBe('AUTH_NOT_VERIFIED');
    expect((await searchFaq(deps, w.mentorA, {})).items.map((i) => i.id)).toEqual([item.id]);
  });

  it('metin araması Türkçe gövdeleme ve yazım hatası toleransıyla çalışır; sayfalama toplamı verir', async () => {
    const w = await world();
    const a = await publishedItem(
      w,
      'Staj başvurusu için transkript gerekir mi',
      'Evet, resmi transkript istenir.',
    );
    await publishedItem(
      w,
      'Erasmus değişim programına kimler başvurabilir',
      'Üçüncü sınıftan itibaren.',
    );
    await publishedItem(
      w,
      'Mezuniyet sonrası yüksek lisans başvurusu nasıl yapılır',
      'ALES ve mülakat şartı.',
    );
    expect((await searchFaq(deps, w.student, { q: 'stajı' })).items.map((i) => i.id)).toEqual([
      a.id,
    ]);
    expect((await searchFaq(deps, w.student, { q: 'transkrpit' })).items.map((i) => i.id)).toEqual([
      a.id,
    ]);
    expect((await searchFaq(deps, w.student, { q: 'ERASMUS' })).total).toBe(1);
    expect((await searchFaq(deps, w.student, { q: 'olmayankelime' })).items).toEqual([]);
    expect((await searchFaq(deps, w.student, { q: '(((' })).items).toEqual([]);
    const page = await searchFaq(deps, w.student, { page: 2, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
    expect((await searchFaq(deps, w.student, { page: 9, pageSize: 2 })).total).toBe(3);
    expect(await code(searchFaq(deps, w.student, { q: 'a' }))).toBe('ZodError');
  });

  it('en yeni yayın önce gelir (metinsiz liste)', async () => {
    const w = await world();
    const first = await publishedItem(w, 'Birinci sorunun yeterince uzun metni burada');
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await publishedItem(w, 'İkinci sorunun yeterince uzun metni burada');
    expect((await searchFaq(deps, w.student, {})).items.map((i) => i.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe('puan geri doldurma, hesap silme ve veri dökümü', () => {
  it('geri doldurma yayınlanmış SSS puanını yazar; ikinci koşu sonucu değiştirmez', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    await publishFaq(deps, w.moderator, publishInput(r));
    await db.pointEntry.deleteMany({
      where: { userId: { in: [w.student, w.mentorA, w.mentorB] } },
    });
    const since = new Date(Date.now() - 3600_000);
    const first = await runPointBackfill({ db, foundingUntil: null }, { since });
    expect(first.faqs).toBeGreaterThanOrEqual(1);
    const snapshot = async () =>
      [w.student, w.mentorA, w.mentorB].map(async (id) =>
        (await pointsOf(id)).map((p) => [p.action, p.points]),
      );
    const before = await Promise.all(await snapshot());
    expect(before).toEqual([
      [['FAQ_QUESTION_PUBLISHED', 2]],
      [['FAQ_ANSWER_SELECTED', 5]],
      [['FAQ_ANSWER_PARTICIPATION', 1]],
    ]);
    const second = await runPointBackfill({ db, foundingUntil: null }, { since });
    expect(second.created).toBe(0);
    expect(await Promise.all(await snapshot())).toEqual(before);
  });

  it('yayınlanmamış (açık/reddedilmiş) talep puan üretmez; bilinmeyen talep yok sayılır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    expect(await awardForFaq({ db }, r.requestId)).toBeNull();
    await rejectFaq(deps, w.moderator, { requestId: r.requestId, reason: 'Tekrar niteliğinde' });
    expect(await awardForFaq({ db }, r.requestId)).toBeNull();
    expect(await awardForFaq({ db }, 'yok')).toBeNull();
    expect(await pointsOf(w.student)).toEqual([]);
  });

  it('veri dökümü yalnız kendi soru/cevaplarını içerir', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    await publishFaq(deps, w.moderator, publishInput(r));
    const asker = await buildDataExport(db, w.student);
    expect(asker.faq.requests).toMatchObject([
      { id: r.requestId, question: QUESTION, status: 'PUBLISHED' },
    ]);
    expect(asker.faq.answers).toEqual([]);
    expect(JSON.stringify(asker.faq)).not.toContain(w.mentorA);
    const mentor = await buildDataExport(db, w.mentorB);
    expect(mentor.faq.requests).toEqual([]);
    expect(mentor.faq.answers).toHaveLength(1);
    expect(mentor.faq.answers[0]).toMatchObject({ id: r.answerB, isSelected: false });
    expect(JSON.stringify(mentor.faq)).not.toContain(w.student);
  });

  it('moderatör hesabını silince SSS karar ve yayın kayıtlarındaki kimlik bağı kopar', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const { faqItemId } = await publishFaq(deps, w.moderator, publishInput(r));
    const { email } = await db.user.findUniqueOrThrow({
      where: { id: w.moderator },
      select: { email: true },
    });
    await deleteAccount(
      db,
      w.moderator,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: null },
    );
    expect(
      (await db.faqRequest.findUniqueOrThrow({ where: { id: r.requestId } })).decidedById,
    ).toBeNull();
    expect(
      (await db.faqItem.findUniqueOrThrow({ where: { id: faqItemId } })).publishedById,
    ).toBeNull();
  });

  it('soran hesabını silince açık talebi silinir, yayınlanmışın bağı kopar ve yayın kalır', async () => {
    const w = await world();
    const published = await requestWithAnswers(w);
    const { faqItemId } = await publishFaq(deps, w.moderator, publishInput(published));
    const open = await submitFaqRequest(deps, w.student, {
      question: 'Yan dal programına başvuru koşulları nelerdir öğrenmek istiyorum',
    });
    const { email } = await db.user.findUniqueOrThrow({
      where: { id: w.student },
      select: { email: true },
    });
    await deleteAccount(
      db,
      w.student,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: null },
    );
    expect(await db.faqRequest.findUnique({ where: { id: open.requestId } })).toBeNull();
    expect(
      await db.faqRequest.findUniqueOrThrow({ where: { id: published.requestId } }),
    ).toMatchObject({
      askerId: null,
      status: 'PUBLISHED',
    });
    expect(await db.faqItem.findUnique({ where: { id: faqItemId } })).toBeTruthy();
    expect(await db.pointEntry.count({ where: { userId: w.student } })).toBe(0);
  });

  it('cevap yazan hesabını silince seçilmeyen cevabı silinir, seçilen kimliksiz kalır', async () => {
    const w = await world();
    const r = await requestWithAnswers(w);
    const open = await submitFaqRequest(deps, w.student2, {
      question: 'Çift anadal başvuru takvimi ne zaman açılır acaba',
    });
    await answerFaqRequest(deps, w.mentorA, {
      requestId: open.requestId,
      body: 'Genellikle güz döneminin ilk haftalarında ilan edilir.',
    });
    await publishFaq(deps, w.moderator, publishInput(r));
    for (const userId of [w.mentorA, w.mentorB]) {
      const { email } = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await deleteAccount(
        db,
        userId,
        { publishedContent: 'DELETE', confirmEmail: email },
        { removeStoredFiles: null },
      );
    }
    expect(await db.faqAnswer.findUnique({ where: { id: r.answerB } })).toBeNull();
    expect(await db.faqAnswer.findUniqueOrThrow({ where: { id: r.answerA } })).toMatchObject({
      mentorId: null,
      isSelected: true,
    });
    expect(await db.faqAnswer.count({ where: { requestId: open.requestId } })).toBe(0);
    expect(await db.faqRequest.findUnique({ where: { id: open.requestId } })).toBeTruthy();
  });
});
