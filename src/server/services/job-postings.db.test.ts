import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JOB_POSTING_SUBMIT_LIMIT } from '@/contracts/job-postings';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import {
  listContactRequests,
  respondToContactRequest,
  revokeContactRequest,
  sendContactRequest,
  withdrawContactRequest,
} from './contactRequest';
import { buildDataExport } from './dataExport';
import { settleEvents } from './event';
import {
  closeJobPosting,
  expireJobPostings,
  getJobPosting,
  getJobPostingFilterOptions,
  getJobPostingFormContext,
  listMyJobPostings,
  reportJobPosting,
  saveJobPostingDraft,
  searchJobPostings,
  submitJobPosting,
} from './job-postings';
import {
  listJobPostingModerationQueue,
  listJobPostingReports,
  resolveJobPostingReport,
  reviewJobPosting,
} from './job-posting-moderation';
import {
  contactNoteFor,
  previewJobPostingContact,
  requestJobPostingContact,
} from './job-posting-contact';
import { awardForJobPosting, runPointBackfill } from './points';
import { visibleJobPostingIds } from '../repositories/job-postings';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
beforeAll(async () => {
  const { seedPointRules } = await import('../../../prisma/seed-points');
  await seedPointRules(db);
});

const NOW = new Date('2030-06-20T09:00:00Z'); // İstanbul 12:00, 20 Haziran
const at = (iso: string) => ({ db, now: () => new Date(iso) });
const deps = { db, now: () => NOW };

type World = Awaited<ReturnType<typeof world>>;
async function world() {
  const inst = await createInstitution(db);
  const make = async (
    role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC',
    name: string,
    departmentId = inst.deptA1,
    status: 'VERIFIED' | 'PENDING' = 'VERIFIED',
  ) => {
    const userId = await createUser(db, { name });
    await addMembership(
      db,
      role === 'STUDENT'
        ? { userId, departmentId, role, status, entryYear: 2024 }
        : role === 'ALUMNI'
          ? { userId, departmentId, role, status, graduationYear: 2020 }
          : { userId, departmentId, role, status },
    );
    await grantRequiredConsents(db, userId);
    return userId;
  };
  const alumni = await make('ALUMNI', 'Mert Yıldız');
  const academic = await make('ACADEMIC', 'Dr. Selin Kaya');
  const student = await make('STUDENT', 'Elif Demirtaş');
  const otherStudent = await make('STUDENT', 'Cem Aksoy', inst.deptB1);
  const unverified = await make('ALUMNI', 'Beklemede Mezun', inst.deptA1, 'PENDING');
  const moderator = await make('ACADEMIC', 'Dr. Moderatör Hoca');
  await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  const otherModerator = await make('ACADEMIC', 'Dr. Başka Hoca', inst.deptB1);
  await addGrant(db, { userId: otherModerator, scope: 'DEPARTMENT', departmentId: inst.deptB1 });
  // başka üniversite
  const foreign = await createInstitution(db);
  const foreignStudent = await make('STUDENT', 'Yabancı Öğrenci', foreign.deptA1);
  return {
    inst,
    foreign,
    make,
    alumni,
    academic,
    student,
    otherStudent,
    unverified,
    moderator,
    otherModerator,
    foreignStudent,
  };
}

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isCodedError(error) ? error.code : error instanceof Error ? error.name : 'unexpected';
  }
};

const content = (w: World, over: Record<string, unknown> = {}) => ({
  kind: 'INTERNSHIP' as const,
  title: 'Veri analisti stajyeri',
  organizationName: 'Örnek Teknoloji',
  location: 'İstanbul',
  isRemote: false,
  description: 'Veri analizi ve raporlama işlerinde destek verecek bir stajyer arıyoruz.',
  applyMethod: 'URL' as const,
  applyUrl: 'https://kariyer.example.com/ilan/1',
  deadlineOn: '2030-07-15',
  targetDepartmentIds: [w.inst.deptA1],
  ...over,
});
const draft = (w: World, author: string, over: Record<string, unknown> = {}, id?: string) =>
  saveJobPostingDraft(deps, author, {
    postingId: id,
    departmentId: w.inst.deptA1,
    content: content(w, over),
  });
async function submitted(w: World, author = w.alumni, over: Record<string, unknown> = {}) {
  const d = await draft(w, author, over);
  await submitJobPosting(deps, author, { postingId: d.id });
  return d.id;
}
async function published(w: World, author = w.alumni, over: Record<string, unknown> = {}) {
  const id = await submitted(w, author, over);
  await reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'PUBLISH' });
  return id;
}
const pointsOf = (userId: string) =>
  db.pointEntry.findMany({
    where: { userId, action: 'JOB_POSTING_PUBLISHED' },
    orderBy: { eventAt: 'asc' },
  });

describe('yazar: form bağlamı ve yetki', () => {
  it('mezun ve akademisyen yazar; form bağlamı yazarın bölümünü ve aynı üniversitenin bölümlerini verir', async () => {
    const w = await world();
    for (const author of [w.alumni, w.academic]) {
      const ctx = await getJobPostingFormContext(deps, author);
      expect(ctx.authorDepartments.map((d) => d.id)).toEqual([w.inst.deptA1]);
      expect(ctx.targetDepartments.map((d) => d.id).sort()).toEqual(
        [w.inst.deptA1, w.inst.deptA2, w.inst.deptB1].sort(),
      );
      expect(ctx.limits).toEqual({
        maxDays: 60,
        submitLimit: 5,
        submitWindowDays: 30,
        maxTargets: 10,
      });
    }
  });

  it('öğrenci, doğrulanmamış mezun ve başka üniversite yazamaz; hiçbir şey kaydedilmez', async () => {
    const w = await world();
    for (const user of [w.student, w.unverified]) {
      expect(await code(getJobPostingFormContext(deps, user))).toMatch(/AUTH_/);
      expect(await code(draft(w, user))).toMatch(/AUTH_/);
      expect(await code(listMyJobPostings(deps, user, {}))).toMatch(/AUTH_/);
    }
    expect(
      await db.jobPosting.count({ where: { authorId: { in: [w.student, w.unverified] } } }),
    ).toBe(0);
  });

  it('rızası olmayan yazar reddedilir (merkezî rıza denetimi)', async () => {
    const w = await world();
    const noConsent = await createUser(db);
    await addMembership(db, {
      userId: noConsent,
      departmentId: w.inst.deptA1,
      role: 'ALUMNI',
      graduationYear: 2020,
    });
    expect(await code(draft(w, noConsent))).toBe('CONSENT_REQUIRED');
  });
});

describe('yazar: taslak', () => {
  it('kaydeder, günceller (tam üzerine yazma), hedef bölümleri değiştirir; çıktıda yazar kimliği yoktur', async () => {
    const w = await world();
    const first = await draft(w, w.alumni, { targetDepartmentIds: [w.inst.deptA1, w.inst.deptA2] });
    expect(first).toMatchObject({
      status: 'DRAFT',
      title: 'Veri analisti stajyeri',
      departmentId: w.inst.deptA1,
      deadlineOn: '2030-07-15',
      moderationNote: null,
    });
    expect(first.targetDepartments).toHaveLength(2);
    const second = await draft(
      w,
      w.alumni,
      { title: 'Güncel başlık', targetDepartmentIds: [w.inst.deptA2] },
      first.id,
    );
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Güncel başlık');
    expect(second.targetDepartments.map((t) => t.id)).toEqual([w.inst.deptA2]);
    expect(JSON.stringify(second)).not.toContain(w.alumni);
    expect(await db.jobPosting.count({ where: { authorId: w.alumni } })).toBe(1);
  });

  it('eksik taslak kaydedilir (boş metin yok sayılır)', async () => {
    const w = await world();
    const saved = await saveJobPostingDraft(deps, w.alumni, {
      departmentId: w.inst.deptA1,
      content: { title: '   ' },
    });
    expect(saved).toMatchObject({
      status: 'DRAFT',
      title: null,
      applyMethod: null,
      deadlineOn: null,
    });
    expect(saved.targetDepartments).toEqual([]);
  });

  it('kapsam: yazarın bölümü dışında, başka üniversitenin hedefi ve başvuru yolu uyuşmazlığı reddedilir', async () => {
    const w = await world();
    expect(
      await code(saveJobPostingDraft(deps, w.alumni, { departmentId: w.inst.deptB1, content: {} })),
    ).toBe('AUTH_FORBIDDEN');
    expect(await code(draft(w, w.alumni, { targetDepartmentIds: [w.foreign.deptA1] }))).toBe(
      'JOB_POSTING_TARGET_INVALID',
    );
    expect(await code(draft(w, w.alumni, { applyMethod: 'CONTACT_REQUEST' }))).toBe(
      'JOB_POSTING_URL_INVALID',
    ); // bağlantı + iletişim yolu
    expect(await code(draft(w, w.alumni, { applyMethod: undefined }))).toBe(
      'JOB_POSTING_URL_INVALID',
    ); // yöntemsiz bağlantı
  });

  it('başkasının ilanı varlığını sızdırmaz; gönderilmiş ilan düzenlenemez; reddedilen düzenlenince taslak olur', async () => {
    const w = await world();
    const id = await submitted(w);
    expect(await code(draft(w, w.academic, {}, id))).toBe('RESOURCE_NOT_FOUND');
    expect(await code(draft(w, w.alumni, { title: 'Yeni' }, id))).toBe('JOB_POSTING_NOT_EDITABLE');
    await reviewJobPosting(deps, w.moderator, {
      postingId: id,
      decision: 'REJECT',
      reason: 'Bağlantı çalışmıyor',
    });
    const reopened = await draft(w, w.alumni, { title: 'Düzeltilmiş başlık' }, id);
    expect(reopened).toMatchObject({ status: 'DRAFT', moderationNote: null });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id } })).toMatchObject({
      moderatedById: null,
      submittedAt: null,
    });
  });

  it('listem yalnız kendi ilanlarımı verir (durum süzgeci, sayfalama)', async () => {
    const w = await world();
    const a = await draft(w, w.alumni);
    const b = await submitted(w);
    await draft(w, w.academic);
    const all = await listMyJobPostings(deps, w.alumni, {});
    expect(all.items.map((i) => i.id).sort()).toEqual([a.id, b].sort());
    expect(
      (await listMyJobPostings(deps, w.alumni, { status: 'PENDING' })).items.map((i) => i.id),
    ).toEqual([b]);
    const page = await listMyJobPostings(deps, w.alumni, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const next = await listMyJobPostings(deps, w.alumni, { limit: 1, cursor: page.nextCursor! });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.id).not.toBe(page.items[0]!.id);
  });
});

describe('yazar: gönder', () => {
  it('tam taslak PENDING olur; tekrar gönderilemez; eksik taslak INCOMPLETE', async () => {
    const w = await world();
    const d = await draft(w, w.alumni);
    expect(await submitJobPosting(deps, w.alumni, { postingId: d.id })).toEqual({
      postingId: d.id,
      status: 'PENDING',
    });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({
      status: 'PENDING',
      submittedAt: NOW,
    });
    expect(await code(submitJobPosting(deps, w.alumni, { postingId: d.id }))).toBe(
      'JOB_POSTING_NOT_DRAFT',
    );
    const incomplete = await saveJobPostingDraft(deps, w.alumni, {
      departmentId: w.inst.deptA1,
      content: { title: 'Kısa taslak' },
    });
    expect(await code(submitJobPosting(deps, w.alumni, { postingId: incomplete.id }))).toBe(
      'JOB_POSTING_INCOMPLETE',
    );
    expect(await code(submitJobPosting(deps, w.academic, { postingId: d.id }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
  });

  it.each([
    ['dün', '2030-06-19', 'JOB_POSTING_DEADLINE_INVALID'],
    ['61. gün', '2030-08-20', 'JOB_POSTING_DEADLINE_INVALID'],
  ])('son başvuru günü: %s reddedilir', async (_name, deadlineOn, expected) => {
    const w = await world();
    const d = await draft(w, w.alumni, { deadlineOn });
    expect(await code(submitJobPosting(deps, w.alumni, { postingId: d.id }))).toBe(expected);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('DRAFT');
  });

  it('bugün (dahil) ve 60. gün (dahil) kabul edilir; gün sınırı İstanbul saatine göredir', async () => {
    const w = await world();
    const today = await draft(w, w.alumni, { deadlineOn: '2030-06-20' });
    await expect(submitJobPosting(deps, w.alumni, { postingId: today.id })).resolves.toBeTruthy();
    const edge = await draft(w, w.academic, { deadlineOn: '2030-08-19' });
    await expect(submitJobPosting(deps, w.academic, { postingId: edge.id })).resolves.toBeTruthy();
    // UTC'de hâlâ 20 Haziran ama İstanbul'da 21 Haziran 00:30: dünün (20 Haziran) tarihi artık geçmiştir.
    const late = at('2030-06-20T21:30:00Z');
    const d = await saveJobPostingDraft(late, w.alumni, {
      departmentId: w.inst.deptA1,
      content: content(w, { deadlineOn: '2030-06-20' }),
    });
    expect(await code(submitJobPosting(late, w.alumni, { postingId: d.id }))).toBe(
      'JOB_POSTING_DEADLINE_INVALID',
    );
  });

  it('hız sınırı: 30 günde 5 gönderim; 6. RATE_LIMITED ve taslak kalır', async () => {
    const w = await world();
    for (let i = 0; i < JOB_POSTING_SUBMIT_LIMIT; i += 1) await submitted(w);
    const sixth = await draft(w, w.alumni);
    expect(await code(submitJobPosting(deps, w.alumni, { postingId: sixth.id }))).toBe(
      'RATE_LIMITED',
    );
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: sixth.id } })).status).toBe(
      'DRAFT',
    );
    // başka yazarın hakkı ayrıdır
    await expect(submitted(w, w.academic)).resolves.toBeTruthy();
  });

  it('sözlük şirketi seçilince kurum adı sözlükteki adla eşitlenir', async () => {
    const w = await world();
    const company = await db.company.create({
      data: { name: 'Sözlük Bilişim A.Ş.', normalizedName: `sozluk-${Math.random()}`, aliases: [] },
    });
    const d = await draft(w, w.alumni, { companyId: company.id, organizationName: 'yanlış ad' });
    await submitJobPosting(deps, w.alumni, { postingId: d.id });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({
      organizationName: 'Sözlük Bilişim A.Ş.',
      companyId: company.id,
    });
  });
});

describe('moderasyon', () => {
  it('kuyruk yalnız kapsamdaki bölümün bekleyen ilanlarını yazarın adıyla verir; yetkisiz 403', async () => {
    const w = await world();
    const id = await submitted(w);
    const other = await submitted(w, w.academic);
    const queue = await listJobPostingModerationQueue(deps, w.moderator, {});
    expect(queue.items.map((i) => i.id).sort()).toEqual([id, other].sort());
    const item = queue.items.find((i) => i.id === id)!;
    expect(item.author).toEqual({ displayName: 'Mert Yıldız', role: 'ALUMNI' });
    expect(JSON.stringify(item)).not.toContain('@');
    // başka bölümün yöneticisi göremez
    expect((await listJobPostingModerationQueue(deps, w.otherModerator, {})).items).toEqual([]);
    for (const user of [w.alumni, w.student])
      expect(await code(listJobPostingModerationQueue(deps, user, {}))).toMatch(/AUTH_/);
  });

  it('yayın: durum, işlem kaydı, bildirim, olay ve gecikmeli 5 puan aynı işlemde yazılır', async () => {
    const w = await world();
    const id = await submitted(w);
    const out = await reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'PUBLISH' });
    expect(out).toEqual({ postingId: id, status: 'PUBLISHED' });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'PUBLISHED',
      moderatedById: w.moderator,
      publishedAt: NOW,
    });
    const logs = await db.adminAuditLog.findMany({ where: { targetId: id } });
    expect(logs).toMatchObject([
      { action: 'MODERATION_PUBLISH', targetType: 'JOB_POSTING', actorId: w.moderator },
    ]);
    const intent = await db.notificationIntent.findFirstOrThrow({ where: { userId: w.alumni } });
    expect(intent.payload).toEqual({
      type: 'generic',
      event: 'jobPostingPublished',
      eventId: id,
      path: '/ilanlarim',
    });
    const [entry] = await pointsOf(w.alumni);
    expect(entry).toMatchObject({
      basePoints: 5,
      multiplierPercent: 100,
      points: 5,
      status: 'PENDING',
      sourceType: 'JOB_POSTING',
      sourceId: id,
      eventAt: NOW,
      finalizesAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    await settleEvents();
    expect(
      await db.event.count({ where: { userId: w.alumni, type: 'JOB_POSTING_PUBLISHED' } }),
    ).toBe(1);
    expect(
      await code(reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'PUBLISH' })),
    ).toBe('JOB_POSTING_NOT_PENDING');
  });

  it('kapsam dışı yönetici ve yazar karar veremez; hiçbir şey değişmez', async () => {
    const w = await world();
    const id = await submitted(w);
    for (const user of [w.otherModerator, w.alumni, w.student])
      expect(
        await code(reviewJobPosting(deps, user, { postingId: id, decision: 'PUBLISH' })),
      ).toMatch(/AUTH_/);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    expect(await db.pointEntry.count({ where: { sourceId: id } })).toBe(0);
    expect(
      await code(reviewJobPosting(deps, w.moderator, { postingId: 'yok', decision: 'PUBLISH' })),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('ret: gerekçe zorunlu, yazara gösterilir, işlem kaydı gerekçeyi taşır, puan yok, bildirim gider', async () => {
    const w = await world();
    const id = await submitted(w);
    expect(
      await code(
        reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'REJECT' } as never),
      ),
    ).toBe('ZodError'); // servis sözleşmeyi doğrular; eylem katmanı parseInput ile VALIDATION_INVALID'a çevirir
    await reviewJobPosting(deps, w.moderator, {
      postingId: id,
      decision: 'REJECT',
      reason: 'Başvuru bağlantısı çalışmıyor',
    });
    const mine = await listMyJobPostings(deps, w.alumni, { status: 'REJECTED' });
    expect(mine.items[0]).toMatchObject({ id, moderationNote: 'Başvuru bağlantısı çalışmıyor' });
    expect(await db.adminAuditLog.findMany({ where: { targetId: id } })).toMatchObject([
      { action: 'MODERATION_REJECT', reason: 'Başvuru bağlantısı çalışmıyor' },
    ]);
    expect(await pointsOf(w.alumni)).toEqual([]);
    expect(
      (await db.notificationIntent.findFirstOrThrow({ where: { userId: w.alumni } })).payload,
    ).toMatchObject({ event: 'jobPostingRejected' });
  });

  it('bekleme sırasında son tarih geçtiyse yayın reddedilir (yazar yeniden gönderir)', async () => {
    const w = await world();
    const id = await submitted(w, w.alumni, { deadlineOn: '2030-06-21' });
    const later = at('2030-06-22T09:00:00Z');
    expect(
      await code(reviewJobPosting(later, w.moderator, { postingId: id, decision: 'PUBLISH' })),
    ).toBe('JOB_POSTING_DEADLINE_INVALID');
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  });
});

describe('ilan puanı: gecikme, aylık tavan, geri çekme', () => {
  it('ayda en çok 3 ilan puan getirir (4. çarpan 0); geri çekilen ilan hakkı serbest bırakır', async () => {
    const w = await world();
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1)
      ids.push(await published(w, w.alumni, { title: `İlan numarası ${i + 1}` }));
    // hız sınırı 5: dördüncü ilan sonrası bir tane daha hakkımız var
    const entries = await pointsOf(w.alumni);
    expect(entries.map((e) => [e.multiplierPercent, e.points])).toEqual([
      [100, 5],
      [100, 5],
      [100, 5],
      [0, 0],
    ]);
    // ilk ilanı çek: bekleyen puan geri alınır; ay hakkı serbest kalır
    await closeJobPosting(deps, w.alumni, { postingId: ids[0]! });
    const afterClose = await pointsOf(w.alumni);
    expect(afterClose[0]).toMatchObject({ status: 'REVOKED', revokedReason: 'POSTING_WITHDRAWN' });
    const fifth = await published(w, w.alumni, { title: 'Beşinci ilan' });
    const fifthEntry = (await pointsOf(w.alumni)).find((e) => e.sourceId === fifth)!;
    expect(fifthEntry).toMatchObject({ multiplierPercent: 100, points: 5 });
  });

  it('başka ayda yazılan ilanlar sayılmaz', async () => {
    const w = await world();
    const may = at('2030-05-10T09:00:00Z');
    for (let i = 0; i < 3; i += 1) {
      const d = await saveJobPostingDraft(may, w.alumni, {
        departmentId: w.inst.deptA1,
        content: content(w, { title: `Mayıs ilanı ${i}`, deadlineOn: '2030-06-30' }),
      });
      await submitJobPosting(may, w.alumni, { postingId: d.id });
      await reviewJobPosting(may, w.moderator, { postingId: d.id, decision: 'PUBLISH' });
    }
    const june = await published(w, w.academic); // başka yazar: kendi sayacı
    expect(june).toBeTruthy();
    const id = await published(w, w.alumni);
    expect((await pointsOf(w.alumni)).find((e) => e.sourceId === id)).toMatchObject({
      multiplierPercent: 100,
      points: 5,
    });
  });

  it('kesinleşmiş (FINAL) puan çekmede kalır; çekmeden önce kesinleşen ilan puanını korur', async () => {
    const w = await world();
    const id = await published(w);
    await db.pointEntry.updateMany({
      where: { sourceId: id },
      data: { status: 'FINAL', finalizedAt: NOW },
    });
    await closeJobPosting(deps, w.alumni, { postingId: id });
    expect((await pointsOf(w.alumni))[0]).toMatchObject({ status: 'FINAL' });
  });

  it('yalnız yayınlanmış (PUBLISHED/EXPIRED) ilana puan yazılır: taslak, bekleyen, reddedilen ve geri çekilen ilana yazılmaz', async () => {
    const w = await world();
    const pending = await submitted(w);
    const closed = await published(w, w.academic);
    await closeJobPosting(deps, w.academic, { postingId: closed });
    await db.pointEntry.deleteMany({ where: { sourceId: closed } });
    const d = await draft(w, w.alumni);
    for (const id of [pending, closed, d.id, 'yok'])
      expect(await awardForJobPosting({ db, now: () => NOW }, id), id).toBeNull();
    expect(
      await db.pointEntry.count({
        where: { sourceType: 'JOB_POSTING', sourceId: { in: [pending, closed, d.id] } },
      }),
    ).toBe(0);
  });

  it('süre dolumu puanı geri almaz; geri doldurma (backfill) idempotenttir ve CLOSED ilana puan yazmaz', async () => {
    const w = await world();
    const id = await published(w);
    await expireJobPostings(at('2030-07-20T09:00:00Z'));
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await pointsOf(w.alumni))[0]).toMatchObject({ status: 'PENDING' });
    // kaçırılmış puanı backfill yazar; ikinci koşu sonucu değiştirmez
    await db.pointEntry.deleteMany({ where: { sourceId: id } });
    const first = await runPointBackfill({ db, now: () => NOW });
    expect(first.jobPostings).toBeGreaterThanOrEqual(1);
    expect(await pointsOf(w.alumni)).toHaveLength(1);
    await runPointBackfill({ db, now: () => NOW });
    expect(await pointsOf(w.alumni)).toHaveLength(1);
    const closed = await published(w, w.academic);
    await closeJobPosting(deps, w.academic, { postingId: closed });
    await db.pointEntry.deleteMany({ where: { sourceId: closed } });
    await runPointBackfill({ db, now: () => NOW });
    expect(await pointsOf(w.academic)).toEqual([]);
  });
});

describe('yazar: kapat', () => {
  it('PENDING ve PUBLISHED çekilir; taslak, reddedilmiş ve kapalı NOT_OPEN; başkası NOT_FOUND', async () => {
    const w = await world();
    const pending = await submitted(w);
    expect(await closeJobPosting(deps, w.alumni, { postingId: pending })).toEqual({
      postingId: pending,
      status: 'CLOSED',
    });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id: pending } })).toMatchObject({
      status: 'CLOSED',
      endedAt: NOW,
      endedById: null,
    });
    expect(await code(closeJobPosting(deps, w.alumni, { postingId: pending }))).toBe(
      'JOB_POSTING_NOT_OPEN',
    );
    const d = await draft(w, w.alumni);
    expect(await code(closeJobPosting(deps, w.alumni, { postingId: d.id }))).toBe(
      'JOB_POSTING_NOT_OPEN',
    );
    expect(await code(closeJobPosting(deps, w.academic, { postingId: d.id }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    const live = await published(w);
    await closeJobPosting(deps, w.alumni, { postingId: live });
    expect((await searchJobPostings(deps, w.student, {})).items.map((i) => i.id)).not.toContain(
      live,
    );
  });
});

describe('okuyucu: arama, detay, süzgeçler (K-07)', () => {
  it('yalnız aynı üniversite, yayında ve süresi dolmamış; yazar adı/kimliği çıkmaz', async () => {
    const w = await world();
    const open = await published(w);
    await submitted(w, w.academic); // PENDING: görünmez
    await draft(w, w.alumni); // DRAFT
    const expired = await published(w, w.academic, { deadlineOn: '2030-06-20' });
    const result = await searchJobPostings(deps, w.student, {});
    expect(result.items.map((i) => i.id).sort()).toEqual([open, expired].sort());
    const card = result.items.find((i) => i.id === open)!;
    expect(card).toMatchObject({
      kind: 'INTERNSHIP',
      title: 'Veri analisti stajyeri',
      organizationName: 'Örnek Teknoloji',
      daysLeft: 25,
      authorKind: 'ALUMNI',
      deadlineOn: '2030-07-15',
    });
    expect(result.items.find((i) => i.id === expired)).toMatchObject({
      daysLeft: 0,
      authorKind: 'ACADEMIC',
    });
    const text = JSON.stringify(result);
    for (const secret of [w.alumni, w.academic, 'Mert', 'Selin', '@'])
      expect(text).not.toContain(secret);
    // son gün geçince listeden kalkar (gün sonu İstanbul)
    const next = at('2030-06-20T21:00:00Z'); // İstanbul 21 Haziran 00:00
    expect((await searchJobPostings(next, w.student, {})).items.map((i) => i.id)).toEqual([open]);
    // başka üniversite hiçbirini görmez
    expect((await searchJobPostings(deps, w.foreignStudent, {})).total).toBe(0);
    expect(await code(searchJobPostings(deps, w.unverified, {}))).toMatch(/AUTH_/);
  });

  it('süzgeçler: bölüm, tür, uzaktan, kalan gün, konum (Türkçe katlama), metin araması', async () => {
    const w = await world();
    const a = await published(w, w.alumni, {
      title: 'Yazılım geliştirme stajyeri',
      location: 'İstanbul',
    });
    const b = await published(w, w.academic, {
      kind: 'JOB',
      title: 'Kıdemli veri mühendisi',
      organizationName: 'Çağdaş Yazılım',
      location: null,
      isRemote: true,
      applyMethod: 'CONTACT_REQUEST',
      applyUrl: null,
      deadlineOn: '2030-06-25',
      targetDepartmentIds: [w.inst.deptA2],
    });
    const ids = async (query: object) =>
      (await searchJobPostings(deps, w.student, query)).items.map((i) => i.id);
    expect(await ids({ departmentId: w.inst.deptA2 })).toEqual([b]);
    expect(await ids({ departmentId: w.inst.deptA1 })).toEqual([a]);
    expect(await ids({ kind: 'JOB' })).toEqual([b]);
    expect(await ids({ remote: true })).toEqual([b]);
    expect(await ids({ remote: false })).toEqual([a]);
    expect(await ids({ withinDays: 7 })).toEqual([b]);
    expect(await ids({ withinDays: 30 })).toHaveLength(2);
    for (const variant of ['istanbul', 'ISTANBUL', 'İstanbul', 'stanbul'])
      expect(await ids({ location: variant }), variant).toEqual([a]);
    expect(await ids({ location: 'Ankara' })).toEqual([]);
    // serbest adlı kurum: tam eşleşme + katlama (kısmi ad eşleşmez)
    for (const variant of ['Çağdaş Yazılım', 'cagdas yazilim', 'ÇAĞDAŞ YAZILIM'])
      expect(await ids({ organizationName: variant }), variant).toEqual([b]);
    expect(await ids({ organizationName: 'Çağdaş' })).toEqual([]);
    expect(await ids({ organizationName: 'Örnek Teknoloji' })).toEqual([a]);
    expect(await ids({ q: 'yazilim' })).toContain(a); // ASCII katlama
    expect(await ids({ q: 'cagdas' })).toEqual([b]); // kurum adı
    expect(await ids({ q: 'mühendisi veri' })).toEqual([b]);
    expect(await ids({ q: '!!!' })).toEqual([]);
    const page = await searchJobPostings(deps, w.student, { pageSize: 1, page: 2 });
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(await searchJobPostings(deps, w.student, { page: 9 })).toMatchObject({
      items: [],
      total: 2,
    });
  });

  it('detay: URL yönteminde bağlantı, iletişim talebinde yazar kimliği; yayında olmayan/başka üniversite/süresi dolmuş NOT_FOUND', async () => {
    const w = await world();
    const url = await published(w);
    const contact = await published(w, w.academic, {
      applyMethod: 'CONTACT_REQUEST',
      applyUrl: null,
    });
    const viaUrl = await getJobPosting(deps, w.student, { id: url });
    expect(viaUrl).toMatchObject({ applyUrl: 'https://kariyer.example.com/ilan/1' });
    expect(viaUrl.description).toContain('stajyer');
    const viaContact = await getJobPosting(deps, w.student, { id: contact });
    expect(viaContact).toMatchObject({ applyUrl: null });
    // D7: yazar kimliği/adı hiçbir okuyucu çıktısında yok (iletişim talebi ilan üzerinden)
    expect(JSON.stringify(viaContact)).not.toContain(w.academic);
    expect(JSON.stringify(viaContact)).not.toContain('Selin');
    expect(Object.keys(viaContact)).not.toContain('contactUserId');
    expect(JSON.stringify(viaUrl)).not.toContain(w.alumni);
    await settleEvents();
    expect(await db.event.count({ where: { userId: w.student, type: 'JOB_POSTING_VIEWED' } })).toBe(
      2,
    );
    const pending = await submitted(w);
    for (const [user, id] of [
      [w.student, pending],
      [w.foreignStudent, url],
      [w.student, 'yok'],
    ] as const)
      expect(await code(getJobPosting(deps, user, { id }))).toBe('RESOURCE_NOT_FOUND');
    expect(await code(getJobPosting(at('2030-07-20T09:00:00Z'), w.student, { id: url }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
  });

  it('süzgeç seçenekleri: yalnız açık ilanlardan, katlamayla gruplu, kişi verisiz', async () => {
    const w = await world();
    await published(w, w.alumni, { location: 'İstanbul', organizationName: 'Örnek Teknoloji' });
    await published(w, w.academic, {
      location: 'istanbul',
      organizationName: 'ÖRNEK TEKNOLOJİ',
      isRemote: true,
    });
    await published(w, w.alumni, {
      location: 'Ankara',
      organizationName: 'Başka Kurum',
      targetDepartmentIds: [w.inst.deptA2],
    });
    await submitted(w, w.academic, { organizationName: 'Beklemedeki Kurum' });
    const options = await getJobPostingFilterOptions(deps, w.student);
    expect(options.organizations.map((o) => o.count)).toEqual([2, 1]);
    expect(
      options.organizations.map((o) => [o.key === (o.companyId ?? o.name), o.companyId]),
    ).toEqual([
      [true, null],
      [true, null],
    ]);
    expect(options.organizations.map((o) => o.name.toLowerCase())).not.toContain(
      'beklemedeki kurum',
    );
    expect(options.locations.map((l) => l.count)).toEqual([2, 1]);
    expect(options.locations.map((l) => l.name.toLowerCase())).toEqual(['istanbul', 'ankara']);
    expect(options.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: w.inst.deptA1, count: 2 }),
        expect.objectContaining({ id: w.inst.deptA2, count: 1 }),
      ]),
    );
    expect(options.remoteCount).toBe(1);
    expect(JSON.stringify(options)).not.toMatch(/Mert|Selin|@/);
    expect(await getJobPostingFilterOptions(deps, w.foreignStudent)).toEqual({
      organizations: [],
      departments: [],
      locations: [],
      remoteCount: 0,
    });
  });
});

describe('kurum süzgeci: sözlük şirketi ve serbest ad ayrı satırlardır', () => {
  it('aynı adlı sözlük şirketi ve serbest ad iki ayrı seçenektir; her biri kendi ilanlarını süzer', async () => {
    const w = await world();
    const company = await db.company.create({
      data: { name: 'Ortak Ad Ltd.', normalizedName: `ortak-${Math.random()}`, aliases: [] },
    });
    const linked = await published(w, w.alumni, {
      companyId: company.id,
      organizationName: 'Ortak Ad Ltd.',
    });
    const free = await published(w, w.academic, { organizationName: 'ORTAK AD LTD.' });
    const options = await getJobPostingFilterOptions(deps, w.student);
    const rows = options.organizations.filter((o) => o.name.toLowerCase() === 'ortak ad ltd.');
    expect(rows).toHaveLength(2);
    expect(rows.map((o) => o.key).sort()).toEqual(
      [company.id, rows.find((o) => !o.companyId)!.name].sort(),
    );
    const ids = async (query: object) =>
      (await searchJobPostings(deps, w.student, query)).items.map((i) => i.id);
    expect(await ids({ companyId: company.id })).toEqual([linked]);
    expect(await ids({ organizationName: 'ortak ad ltd.' })).toEqual([free]);
    // ikisi birlikte gönderilemez (sözleşme)
    expect(
      await code(
        searchJobPostings(deps, w.student, { companyId: company.id, organizationName: 'x y' }),
      ),
    ).toBe('ZodError');
  });
});

describe('K-07 servis kapısı: hedef bölümler yazarın üniversitesinden', () => {
  it('başka üniversitenin bölümü taslakta ve (veritabanına doğrudan bağlanmış olsa da) gönderimde reddedilir', async () => {
    const w = await world();
    expect(await code(draft(w, w.alumni, { targetDepartmentIds: [w.foreign.deptA1] }))).toBe(
      'JOB_POSTING_TARGET_INVALID',
    );
    expect(
      await code(draft(w, w.alumni, { targetDepartmentIds: [w.inst.deptA1, w.foreign.deptA2] })),
    ).toBe('JOB_POSTING_TARGET_INVALID');
    // 11 bölüm sınırı (sözleşme)
    expect(
      await code(
        draft(w, w.alumni, { targetDepartmentIds: Array.from({ length: 11 }, (_, i) => `d${i}`) }),
      ),
    ).toBe('ZodError');
    // veritabanı kapısı yok: yanlış bağ doğrudan eklenirse servis gönderimde yakalar
    const d = await draft(w, w.alumni);
    await db.jobPostingDepartment.create({
      data: { postingId: d.id, departmentId: w.foreign.deptA1 },
    });
    expect(await code(submitJobPosting(deps, w.alumni, { postingId: d.id }))).toBe(
      'JOB_POSTING_TARGET_INVALID',
    );
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('DRAFT');
    // yazarın üyeliği dışındaki bölüm kapsam (moderasyon) olarak seçilemez
    expect(
      await code(
        saveJobPostingDraft(deps, w.alumni, { departmentId: w.foreign.deptA1, content: {} }),
      ),
    ).toBe('AUTH_FORBIDDEN');
  });

  it('başka üniversitede üyeliği olan yazarın ilanı kendi üniversitesine hedeflenir; ilk üniversitedeki hedef geçersizdir', async () => {
    const w = await world();
    const foreignAlumni = await w.make('ALUMNI', 'Yabancı Mezun', w.foreign.deptA1);
    const d = await saveJobPostingDraft(deps, foreignAlumni, {
      departmentId: w.foreign.deptA1,
      content: content(w, { targetDepartmentIds: [w.foreign.deptA2] }),
    });
    expect(d.targetDepartments.map((t) => t.id)).toEqual([w.foreign.deptA2]);
    expect(
      await code(
        saveJobPostingDraft(deps, foreignAlumni, {
          departmentId: w.foreign.deptA1,
          content: content(w, { targetDepartmentIds: [w.inst.deptA1] }),
        }),
      ),
    ).toBe('JOB_POSTING_TARGET_INVALID');
  });
});

describe('ilan üzerinden iletişim (D7)', () => {
  const contactPosting = (w: World) =>
    published(w, w.academic, { applyMethod: 'CONTACT_REQUEST', applyUrl: null });
  const generic = {
    canRequest: false,
    postingTitle: null,
    organizationName: null,
    requestableFields: [],
  };

  it('önizleme ilan başlığı/kurum ve açık alanları verir; yazar adı/kimliği yoktur', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const preview = await previewJobPostingContact(deps, w.student, { jobPostingId: id });
    expect(preview).toEqual({
      canRequest: true,
      postingTitle: 'Veri analisti stajyeri',
      organizationName: 'Örnek Teknoloji',
      requestableFields: ['EMAIL', 'PHONE'],
    });
    const text = JSON.stringify(preview);
    for (const secret of [w.academic, 'Selin', 'Kaya', '@']) expect(text).not.toContain(secret);
  });

  it('talep edilemeyen her durum tek genel yanıttır: yok, kapsam dışı, URL yöntemi, kendi ilanı, süresi dolmuş, yazar askıda, alan yok', async () => {
    const w = await world();
    const contact = await contactPosting(w);
    const urlPosting = await published(w, w.alumni);
    const cases: [string, string, string][] = [
      ['olmayan ilan', w.student, 'yok'],
      ['URL yöntemi', w.student, urlPosting],
      ['başka üniversite', w.foreignStudent, contact],
      ['kendi ilanı', w.academic, contact],
    ];
    for (const [name, user, id] of cases)
      expect(await previewJobPostingContact(deps, user, { jobPostingId: id }), name).toEqual(
        generic,
      );
    expect(
      await previewJobPostingContact(at('2030-07-20T09:00:00Z'), w.student, {
        jobPostingId: contact,
      }),
    ).toEqual(generic);
    await db.user.update({ where: { id: w.academic }, data: { banned: true } });
    expect(await previewJobPostingContact(deps, w.student, { jobPostingId: contact })).toEqual(
      generic,
    );
    await db.user.update({ where: { id: w.academic }, data: { banned: false } });
    await db.fieldVisibility.createMany({
      data: [
        { userId: w.academic, field: 'EMAIL', level: 'PRIVATE' },
        { userId: w.academic, field: 'PHONE', level: 'PRIVATE' },
      ],
    });
    expect(await previewJobPostingContact(deps, w.student, { jobPostingId: contact })).toEqual(
      generic,
    );
  });

  it('talep gönderir: kayıt ilan bağlamıyla, yazara bildirim; çıktıda yazar kimliği yoktur', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const out = await requestJobPostingContact(deps, w.student, {
      jobPostingId: id,
      fields: ['EMAIL'],
      message: 'Merhaba, başvurmak istiyorum.',
    });
    expect(out).toMatchObject({ status: 'PENDING' });
    expect(Object.keys(out).sort()).toEqual(['requestId', 'status']);
    const row = await db.contactRequest.findUniqueOrThrow({ where: { id: out.requestId } });
    expect(row).toMatchObject({
      requesterId: w.student,
      targetId: w.academic,
      status: 'PENDING',
      message: 'İlan: Veri analisti stajyeri — Merhaba, başvurmak istiyorum.',
    });
    expect(row.fields).toEqual(['EMAIL']);
    expect(JSON.stringify(out)).not.toContain(w.academic);
    const intents = await db.notificationIntent.findMany({ where: { userId: w.academic } });
    expect(intents.map((i) => i.payload)).toContainEqual({
      type: 'generic',
      event: 'contact',
      eventId: out.requestId,
      path: '/hesap/iletisim',
    });
    expect(
      await code(
        requestJobPostingContact(deps, w.student, { jobPostingId: id, fields: ['PHONE'] }),
      ),
    ).toBe('CONTACT_REQUEST_ALREADY_OPEN');
  });

  it('hatalar: görünmez/URL yöntemi/başka üniversite NOT_FOUND, kendi ilanı SELF, açık olmayan alan reddedilir', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const urlPosting = await published(w, w.alumni);
    for (const [user, jobPostingId] of [
      [w.student, 'yok'],
      [w.student, urlPosting],
      [w.foreignStudent, id],
    ] as const)
      expect(
        await code(requestJobPostingContact(deps, user, { jobPostingId, fields: ['EMAIL'] })),
      ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(
        requestJobPostingContact(deps, w.academic, { jobPostingId: id, fields: ['EMAIL'] }),
      ),
    ).toBe('CONTACT_REQUEST_SELF');
    expect(
      await code(
        requestJobPostingContact(deps, w.student, { jobPostingId: id, fields: ['LINKEDIN'] }),
      ),
    ).toBe('CONTACT_FIELD_NOT_REQUESTABLE');
    expect(await db.contactRequest.count({ where: { requesterId: w.student } })).toBe(0);
    expect(await code(previewJobPostingContact(deps, w.unverified, { jobPostingId: id }))).toMatch(
      /AUTH_/,
    );
  });

  it('önizleme hız sınırı: saatte 60; aşınca RATE_LIMITED', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const viewer = await w.make('STUDENT', 'Hız Sınırı Öğrencisi');
    for (let i = 0; i < 60; i += 1)
      await previewJobPostingContact(deps, viewer, { jobPostingId: id });
    expect(await code(previewJobPostingContact(deps, viewer, { jobPostingId: id }))).toBe(
      'RATE_LIMITED',
    );
  });

  it('contactNoteFor: bağlam + not; uzun başlık kısalır, uzun not 500 karaktere sığar', () => {
    expect(contactNoteFor('Stajyer', null)).toBe('İlan: Stajyer');
    expect(contactNoteFor('Stajyer', '   ')).toBe('İlan: Stajyer');
    expect(contactNoteFor('Stajyer', ' Merhaba ')).toBe('İlan: Stajyer — Merhaba');
    expect(contactNoteFor('a'.repeat(200), null)).toBe(`İlan: ${'a'.repeat(80)}…`);
    const long = contactNoteFor('Stajyer', 'b'.repeat(500));
    expect(long.length).toBe(500);
    expect(long.startsWith('İlan: Stajyer — b')).toBe(true);
  });
});

describe('D7 sızıntı bekçisi: ilan kaynaklı talepte hedef kimliği onaydan önce açılmaz', () => {
  const contactPosting = (w: World) =>
    published(w, w.academic, { applyMethod: 'CONTACT_REQUEST', applyUrl: null });
  const outgoing = (user: string, status?: 'PENDING') =>
    listContactRequests(db, user, { box: 'OUTGOING', limit: 50, ...(status ? { status } : {}) });
  const noAuthorTrace = (w: World, value: unknown) => {
    const text = JSON.stringify(value);
    for (const secret of [w.academic, 'Selin', 'Kaya', 'selin']) expect(text).not.toContain(secret);
  };

  it('PENDING / REJECTED / WITHDRAWN: counterpart null, yalnız ilan başlığı + kurum; kullanıcı kimliği ve adı yok', async () => {
    const w = await world();
    const ids: Record<string, string> = {};
    for (const [label, requester] of [
      ['pending', w.student],
      ['rejected', w.otherStudent],
      ['withdrawn', await w.make('STUDENT', 'Üçüncü Öğrenci')],
    ] as const) {
      const id = await contactPosting(w);
      const out = await requestJobPostingContact(deps, requester, {
        jobPostingId: id,
        fields: ['EMAIL'],
      });
      ids[label] = out.requestId;
      if (label === 'rejected')
        await respondToContactRequest(db, w.academic, {
          requestId: out.requestId,
          decision: 'REJECT',
        });
      if (label === 'withdrawn')
        await withdrawContactRequest(db, requester, { requestId: out.requestId });
      const page = await outgoing(requester);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: out.requestId,
        counterpart: null,
        origin: {
          kind: 'JOB_POSTING',
          title: 'Veri analisti stajyeri',
          organization: 'Örnek Teknoloji',
        },
        revealed: null,
      });
      noAuthorTrace(w, page);
    }
    expect(Object.keys(ids)).toHaveLength(3);
  });

  it('ilan kapanınca, süresi dolunca ve silinince de sızmaz (kaynak işareti ve özet talepte kalır)', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const { requestId } = await requestJobPostingContact(deps, w.student, {
      jobPostingId: id,
      fields: ['EMAIL'],
    });
    await closeJobPosting(deps, w.academic, { postingId: id });
    expect((await outgoing(w.student)).items[0]).toMatchObject({ counterpart: null });
    await db.jobPosting.delete({ where: { id } }); // yazar hesabı silinince olduğu gibi: FK SET NULL
    const row = await db.contactRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row).toMatchObject({
      source: 'JOB_POSTING',
      jobPostingId: null,
      sourceTitle: 'Veri analisti stajyeri',
    });
    const page = await outgoing(w.student);
    expect(page.items[0]).toMatchObject({
      counterpart: null,
      origin: { title: 'Veri analisti stajyeri', organization: 'Örnek Teknoloji' },
    });
    noAuthorTrace(w, page);
  });

  it('APPROVED: kimlik ve ad açılır, istenen alan paylaşılır, kaynak kalır; onay geri alınınca (REVOKED) yeniden gizlenir', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const { requestId } = await requestJobPostingContact(deps, w.student, {
      jobPostingId: id,
      fields: ['EMAIL'],
    });
    await respondToContactRequest(db, w.academic, { requestId, decision: 'APPROVE' });
    const approved = (await outgoing(w.student)).items[0]!;
    expect(approved.counterpart).toEqual({ userId: w.academic, name: 'Dr. Selin Kaya' });
    expect(approved.origin).toMatchObject({ title: 'Veri analisti stajyeri' });
    expect(approved.revealed?.EMAIL).toBeTruthy();
    await revokeContactRequest(db, w.academic, { requestId });
    const revoked = (await outgoing(w.student)).items[0]!;
    expect(revoked).toMatchObject({ status: 'REVOKED', counterpart: null, revealed: null });
    noAuthorTrace(w, revoked);
  });

  it('gelen kutusu: yazar talep edeni ve ilanı görür; doğrudan profil talebi bugünkü gibi hedefi gösterir', async () => {
    const w = await world();
    const id = await contactPosting(w);
    await requestJobPostingContact(deps, w.student, { jobPostingId: id, fields: ['EMAIL'] });
    const incoming = await listContactRequests(db, w.academic, { box: 'INCOMING', limit: 50 });
    expect(incoming.items[0]).toMatchObject({
      counterpart: { userId: w.student, name: 'Elif Demirtaş' },
      origin: { kind: 'JOB_POSTING', title: 'Veri analisti stajyeri' },
    });
    // doğrudan profil talebi (kişiyi kendisi seçmiş): hedef PENDING'de de görünür, origin null
    await sendContactRequest(db, w.otherStudent, { targetUserId: w.alumni, fields: ['EMAIL'] });
    const direct = (await outgoing(w.otherStudent)).items[0]!;
    expect(direct).toMatchObject({
      counterpart: { userId: w.alumni, name: 'Mert Yıldız' },
      origin: null,
    });
    expect(
      await db.contactRequest.findFirstOrThrow({ where: { requesterId: w.otherStudent } }),
    ).toMatchObject({ source: 'PROFILE', jobPostingId: null, sourceTitle: null });
  });

  it('veri dökümü: ilan kaynaklı onaysız giden talepte hedef kimliği yok; onayda açılır; doğrudan talepte bugünkü gibi', async () => {
    const w = await world();
    const id = await contactPosting(w);
    const { requestId } = await requestJobPostingContact(deps, w.student, {
      jobPostingId: id,
      fields: ['EMAIL'],
    });
    await sendContactRequest(db, w.student, { targetUserId: w.alumni, fields: ['EMAIL'] });
    const dump = await buildDataExport(db, w.student);
    const job = dump.contactRequests.sent.find((r) => r.id === requestId)!;
    expect(job).toMatchObject({ targetId: null, origin: { title: 'Veri analisti stajyeri' } });
    noAuthorTrace(w, job);
    expect(dump.contactRequests.sent.find((r) => r.id !== requestId)).toMatchObject({
      targetId: w.alumni,
      origin: null,
    });
    await respondToContactRequest(db, w.academic, { requestId, decision: 'APPROVE' });
    expect(
      (await buildDataExport(db, w.student)).contactRequests.sent.find((r) => r.id === requestId),
    ).toMatchObject({
      targetId: w.academic,
    });
    // onay geri alınınca / ret / geri çekme sonrası da hedef kimliği dökümde yok (yalnız APPROVED'da açılır)
    await revokeContactRequest(db, w.academic, { requestId });
    expect(
      (await buildDataExport(db, w.student)).contactRequests.sent.find((r) => r.id === requestId),
    ).toMatchObject({
      status: 'REVOKED',
      targetId: null,
    });
    const second = await contactPosting(w);
    const rejected = await requestJobPostingContact(deps, w.otherStudent, {
      jobPostingId: second,
      fields: ['EMAIL'],
    });
    await respondToContactRequest(db, w.academic, {
      requestId: rejected.requestId,
      decision: 'REJECT',
    });
    expect(
      (await buildDataExport(db, w.otherStudent)).contactRequests.sent.find(
        (r) => r.id === rejected.requestId,
      ),
    ).toMatchObject({ status: 'REJECTED', targetId: null });
    // yazarın kendi dökümü: gelen talepte talep eden görünür (kendi verisi)
    expect((await buildDataExport(db, w.academic)).contactRequests.received[0]).toMatchObject({
      requesterId: w.student,
      origin: { title: 'Veri analisti stajyeri' },
    });
  });

  it('veritabanı değişmezi: JOB_POSTING kaynağı başlık/kurum özetsiz yazılamaz; PROFILE ilan izi taşıyamaz', async () => {
    const w = await world();
    const base = { requesterId: w.student, targetId: w.academic, fields: ['EMAIL' as const] };
    await expect(
      db.contactRequest.create({ data: { ...base, source: 'JOB_POSTING' } }),
    ).rejects.toThrow();
    await expect(
      db.contactRequest.create({
        data: { ...base, source: 'JOB_POSTING', sourceTitle: 'x', sourceOrganization: ' ' },
      }),
    ).rejects.toThrow();
    await expect(
      db.contactRequest.create({ data: { ...base, sourceTitle: 'x' } }),
    ).rejects.toThrow();
    await expect(
      db.contactRequest.create({
        data: { ...base, source: 'JOB_POSTING', sourceTitle: 'x', sourceOrganization: 'y' },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('şikâyet', () => {
  it('hedef bölüm yöneticisi şikâyeti görüp karara bağlar; yazan bölüm yöneticisi ve ilan sahibi raportörü göremez', async () => {
    const w = await world();
    const id = await published(w, w.alumni, { targetDepartmentIds: [w.inst.deptB1] });
    const report = await reportJobPosting(deps, w.student, {
      postingId: id,
      reason: 'Yanıltıcı ilan',
    });
    expect((await listJobPostingReports(deps, w.moderator, {})).items).toEqual([]);
    const queue = await listJobPostingReports(deps, w.otherModerator, {});
    expect(queue.items.map((item) => item.id)).toEqual([report.reportId]);
    expect(JSON.stringify(queue)).not.toContain(w.student);
    const authorView = JSON.stringify(await listMyJobPostings(deps, w.alumni, {}));
    expect(authorView).not.toContain(w.student);
    expect(authorView).not.toContain('Elif Demirtaş');
    expect(
      await code(
        resolveJobPostingReport(deps, w.moderator, {
          reportId: report.reportId,
          decision: 'DISMISS',
          reason: 'İncelendi',
        }),
      ),
    ).toBe('AUTH_FORBIDDEN');
    await resolveJobPostingReport(deps, w.otherModerator, {
      reportId: report.reportId,
      decision: 'DISMISS',
      reason: 'İncelendi',
    });
    expect(await code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Tekrar' }))).toBe(
      'REPORT_ALREADY_OPEN',
    );
  });

  it('eşzamanlı aynı kullanıcı şikâyeti tek kayıttır; karar sonrası da yinelenmez', async () => {
    const w = await world();
    const id = await published(w);
    const attempts = await Promise.all([
      code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Yanıltıcı ilan' })),
      code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Yanıltıcı ilan' })),
    ]);
    expect(attempts.filter((result) => result === null)).toHaveLength(1);
    expect(attempts.filter((result) => result === 'REPORT_ALREADY_OPEN')).toHaveLength(1);
    const reports = await db.jobPostingReport.findMany({ where: { postingId: id } });
    expect(reports).toHaveLength(1);
    await resolveJobPostingReport(deps, w.moderator, {
      reportId: reports[0]!.id,
      decision: 'DISMISS',
      reason: 'Sorun görülmedi',
    });
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Yeniden' })),
    ).toBe('REPORT_ALREADY_OPEN');
  });

  it('şikâyetçinin kimliği yanıt, sahip verisi, bildirim yükü ve işlem kaydında yoktur', async () => {
    const w = await world();
    const id = await published(w);
    const reporter = await db.user.findUniqueOrThrow({
      where: { id: w.student },
      select: { id: true, name: true, email: true },
    });
    const report = await reportJobPosting(deps, w.student, {
      postingId: id,
      reason: 'Yanıltıcı ilan',
    });
    const surfaces: unknown[] = [
      report,
      await listJobPostingReports(deps, w.moderator, {}),
      await listMyJobPostings(deps, w.alumni, {}),
      await getJobPosting(deps, w.alumni, { id }),
    ];
    const resolved = await resolveJobPostingReport(deps, w.moderator, {
      reportId: report.reportId,
      decision: 'TAKE_DOWN',
      reason: 'İnceleme tamamlandı',
    });
    surfaces.push(
      resolved,
      await listMyJobPostings(deps, w.alumni, {}),
      (await buildDataExport(db, w.alumni)).jobPostings,
      await db.notificationIntent.findMany({ where: { userId: w.alumni } }),
      await db.adminAuditLog.findMany({ where: { targetId: report.reportId } }),
    );
    for (const surface of surfaces) {
      const text = JSON.stringify(surface);
      for (const secret of [reporter.id, reporter.name, reporter.email, 'reporterId', 'reporter'])
        expect(text).not.toContain(secret);
    }
    expect(await code(getJobPosting(deps, w.student, { id }))).toBe('RESOURCE_NOT_FOUND');
    for (const actor of [w.student, w.alumni, w.unverified, w.otherModerator]) {
      expect(
        await code(
          resolveJobPostingReport(deps, actor, {
            reportId: report.reportId,
            decision: 'DISMISS',
            reason: 'Kapsam dışı',
          }),
        ),
      ).toMatch(/AUTH_/);
    }
  });

  it('açık ve görünür ilan şikâyet edilir; çift açık şikâyet, görünmeyen ve süresi dolmuş ilan reddedilir', async () => {
    const w = await world();
    const id = await published(w);
    const report = await reportJobPosting(deps, w.student, {
      postingId: id,
      reason: 'Sahte ilan görünüyor',
    });
    expect(report).toMatchObject({ status: 'OPEN' });
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Yine sahte' })),
    ).toBe('REPORT_ALREADY_OPEN');
    expect(
      await code(reportJobPosting(deps, w.foreignStudent, { postingId: id, reason: 'Sahte' })),
    ).toBe('RESOURCE_NOT_FOUND');
    const pending = await submitted(w);
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: pending, reason: 'Sahte' })),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(
        reportJobPosting(at('2030-07-20T09:00:00Z'), w.otherStudent, {
          postingId: id,
          reason: 'Süresi geçmiş',
        }),
      ),
    ).toBe('JOB_POSTING_NOT_OPEN');
  });

  it('günlük 10 şikâyet sınırı', async () => {
    const w = await world();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1)
      ids.push(await published(w, w.academic, { title: `Şikâyet ilanı ${i}` }));
    for (let i = 0; i < 5; i += 1)
      ids.push(await published(w, w.alumni, { title: `Şikâyet ilanı ${i + 5}` }));
    for (const id of ids)
      await reportJobPosting(deps, w.student, { postingId: id, reason: 'Sorunlu ilan' });
    const extra = await published(w, await w.make('ALUMNI', 'Üçüncü Mezun'), {
      title: 'Onbirinci ilan',
    });
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: extra, reason: 'Sorunlu' })),
    ).toBe('RATE_LIMITED');
  });

  it('moderatör listeler (raportör kimliği yok) ve karar verir: DISMISS ilanı bırakır, TAKE_DOWN kapatır ve puanı geri alır', async () => {
    const w = await world();
    const keep = await published(w);
    const down = await published(w, w.academic);
    const r1 = await reportJobPosting(deps, w.student, {
      postingId: keep,
      reason: 'Şüpheli görünüyor',
    });
    const r2 = await reportJobPosting(deps, w.student, { postingId: down, reason: 'Sahte kurum' });
    const r3 = await reportJobPosting(deps, w.otherStudent, {
      postingId: down,
      reason: 'Aynı sahte kurum',
    });
    const list = await listJobPostingReports(deps, w.moderator, {});
    expect(list.items.map((i) => i.id).sort()).toEqual(
      [r1.reportId, r2.reportId, r3.reportId].sort(),
    );
    expect(JSON.stringify(list)).not.toContain(w.student);
    expect((await listJobPostingReports(deps, w.otherModerator, {})).items).toEqual([]);
    for (const user of [w.student, w.alumni])
      expect(await code(listJobPostingReports(deps, user, {}))).toMatch(/AUTH_/);

    expect(
      await resolveJobPostingReport(deps, w.moderator, {
        reportId: r1.reportId,
        decision: 'DISMISS',
        reason: 'Sorun görülmedi',
      }),
    ).toEqual({ reportId: r1.reportId, status: 'DISMISSED' });
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: keep } })).status).toBe(
      'PUBLISHED',
    );

    expect(
      await resolveJobPostingReport(deps, w.moderator, {
        reportId: r2.reportId,
        decision: 'TAKE_DOWN',
        reason: 'Kurum doğrulanamadı',
      }),
    ).toEqual({ reportId: r2.reportId, status: 'RESOLVED' });
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id: down } })).toMatchObject({
      status: 'CLOSED',
      endedById: w.moderator,
    });
    // aynı ilanın diğer açık şikâyeti de kapandı
    expect(
      (await db.jobPostingReport.findUniqueOrThrow({ where: { id: r3.reportId } })).status,
    ).toBe('RESOLVED');
    expect((await pointsOf(w.academic))[0]).toMatchObject({
      status: 'REVOKED',
      revokedReason: 'POSTING_WITHDRAWN',
    });
    const logs = await db.adminAuditLog.findMany({ where: { targetId: r2.reportId } });
    expect(logs).toMatchObject([
      {
        action: 'REPORT_RESOLVE',
        targetType: 'REPORT',
        reason: 'Kurum doğrulanamadı',
        metadata: { decision: 'TAKE_DOWN', withdrawnPoints: 1 },
      },
    ]);
    expect(
      await code(
        resolveJobPostingReport(deps, w.moderator, {
          reportId: r2.reportId,
          decision: 'DISMISS',
          reason: 'Geç',
        }),
      ),
    ).toBe('REPORT_NOT_OPEN');
    expect(
      await code(
        resolveJobPostingReport(deps, w.otherModerator, {
          reportId: r1.reportId,
          decision: 'DISMISS',
          reason: 'Yetkisiz',
        }),
      ),
    ).toMatch(/AUTH_/);
    expect(
      await code(
        resolveJobPostingReport(deps, w.moderator, {
          reportId: 'yok',
          decision: 'DISMISS',
          reason: 'Yok',
        }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('postings.expire', () => {
  it('süresi dolan yayındaki ve bekleyen ilan EXPIRED olur; taslak/ret dokunulmaz; bildirim gider; idempotent', async () => {
    const w = await world();
    const live = await published(w, w.alumni, { deadlineOn: '2030-06-25' });
    const keep = await published(w, w.academic, { deadlineOn: '2030-08-01' });
    const pending = await submitted(w, w.alumni, { deadlineOn: '2030-06-26' });
    const draftRow = await draft(w, w.academic, { deadlineOn: '2030-06-21' });
    const rejected = await submitted(w, w.academic, { deadlineOn: '2030-06-22' });
    await reviewJobPosting(deps, w.moderator, {
      postingId: rejected,
      decision: 'REJECT',
      reason: 'Uygunsuz',
    });
    const later = at('2030-07-01T09:00:00Z');
    // Paylaşılan test veritabanında başka testlerin süresi dolmuş ilanları da kapanabilir: en az bu ikisi.
    expect((await expireJobPostings(later)).expired).toBeGreaterThanOrEqual(2);
    expect(await expireJobPostings(later)).toEqual({ expired: 0 });
    const status = async (id: string) =>
      (await db.jobPosting.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(live)).toBe('EXPIRED');
    expect(await status(pending)).toBe('EXPIRED');
    expect(await status(keep)).toBe('PUBLISHED');
    expect(await status(draftRow.id)).toBe('DRAFT');
    expect(await status(rejected)).toBe('REJECTED');
    const intents = await db.notificationIntent.findMany({ where: { userId: w.alumni } });
    expect(
      intents.filter((i) => (i.payload as { event: string }).event === 'jobPostingExpired'),
    ).toHaveLength(2);
    // süresi dolan kuyrukta kalmaz
    expect(
      (await listJobPostingModerationQueue(deps, w.moderator, {})).items.map((i) => i.id),
    ).not.toContain(pending);
  });

  it('son gün bugünse ilan açık kalır; ertesi İstanbul günü kapanır', async () => {
    const w = await world();
    const id = await published(w, w.alumni, { deadlineOn: '2030-06-20' });
    expect(await expireJobPostings({ db, now: () => new Date('2030-06-20T20:59:00Z') })).toEqual({
      expired: 0,
    });
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe('PUBLISHED');
    expect(
      await expireJobPostings({ db, now: () => new Date('2030-06-20T21:00:00Z') }),
    ).toMatchObject({
      expired: expect.any(Number),
    });
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });
});

describe('hesap silme ve veri dökümü', () => {
  const erase = async (userId: string) => {
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
  };

  it('veri dökümü yalnız kendi ilanlarını içerir (moderatör, raportör ve başkasının ilanı yok)', async () => {
    const w = await world();
    const mine = await published(w);
    const other = await published(w, w.academic);
    await reportJobPosting(deps, w.student, { postingId: mine, reason: 'Sahte ilan görünüyor' });
    const dump = await buildDataExport(db, w.alumni);
    expect(dump.jobPostings).toHaveLength(1);
    expect(dump.jobPostings[0]).toMatchObject({
      id: mine,
      status: 'PUBLISHED',
      title: 'Veri analisti stajyeri',
      deadlineOn: '2030-07-15',
      applyUrl: 'https://kariyer.example.com/ilan/1',
    });
    const text = JSON.stringify(dump.jobPostings);
    for (const secret of [w.moderator, w.student, w.academic, other, 'Sahte ilan'])
      expect(text).not.toContain(secret);
    expect((await buildDataExport(db, w.student)).jobPostings).toEqual([]);
  });

  it('yazar hesabını silince ilanları (hedef bölüm ve şikâyetleriyle) silinir; puanlar silinir; başkasının ilanı kalır', async () => {
    const w = await world();
    const mine = await published(w);
    const other = await published(w, w.academic);
    await reportJobPosting(deps, w.student, { postingId: mine, reason: 'Sahte ilan görünüyor' });
    await erase(w.alumni);
    expect(await db.jobPosting.count({ where: { authorId: w.alumni } })).toBe(0);
    expect(await db.jobPostingDepartment.count({ where: { postingId: mine } })).toBe(0);
    expect(await db.jobPostingReport.count({ where: { postingId: mine } })).toBe(0);
    expect(await db.pointEntry.count({ where: { userId: w.alumni } })).toBe(0);
    expect(await db.jobPosting.findUnique({ where: { id: other } })).toMatchObject({
      status: 'PUBLISHED',
    });
    expect((await searchJobPostings(deps, w.student, {})).items.map((i) => i.id)).toEqual([other]);
  });

  it('raportör hesabını silince şikâyet kalır, raportör bağı kopar; moderatör silince ilan kalır', async () => {
    const w = await world();
    const id = await published(w);
    const report = await reportJobPosting(deps, w.student, {
      postingId: id,
      reason: 'Sahte ilan görünüyor',
    });
    await erase(w.student);
    expect(
      await db.jobPostingReport.findUniqueOrThrow({ where: { id: report.reportId } }),
    ).toMatchObject({
      reporterId: null,
      status: 'OPEN',
    });
    await erase(w.moderator);
    expect(await db.jobPosting.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'PUBLISHED',
    });
  });
});

describe('D7 bağlantı sızıntısı: aynı yazarın iki ilanı ayırt edilemez (kart 136)', () => {
  const contactPosting = (w: World, author: string, title: string) =>
    published(w, author, { applyMethod: 'CONTACT_REQUEST', applyUrl: null, title });

  it('bekleyen talep varken aynı yazarın başka ilanına talep, başka yazarınkiyle aynı başarı biçimindedir; bağımsız kayıt ve bildirim oluşur', async () => {
    const w = await world();
    const a = await contactPosting(w, w.academic, 'İlan A ilanı');
    const b = await contactPosting(w, w.academic, 'İlan B ilanı');
    const c = await contactPosting(w, w.alumni, 'İlan C ilanı');
    const first = await requestJobPostingContact(deps, w.student, {
      jobPostingId: a,
      fields: ['EMAIL'],
    });
    const sameAuthor = await requestJobPostingContact(deps, w.student, {
      jobPostingId: b,
      fields: ['EMAIL'],
    });
    const otherAuthor = await requestJobPostingContact(deps, w.student, {
      jobPostingId: c,
      fields: ['EMAIL'],
    });
    expect(sameAuthor.status).toBe('PENDING');
    expect(sameAuthor.requestId).not.toBe(first.requestId);
    expect(otherAuthor.status).toBe('PENDING');
    expect(otherAuthor.requestId).not.toBe(first.requestId);
    expect(
      await db.contactRequest.count({ where: { requesterId: w.student, targetId: w.academic } }),
    ).toBe(2);
    const contacts = (await db.notificationIntent.findMany({ where: { userId: w.academic } }))
      .map((intent) => intent.payload as { event?: string })
      .filter((payload) => payload.event === 'contact');
    expect(contacts).toHaveLength(2);
    // aynı ilana tekrar talep kullanıcıya zaten bilinir: hata aynen kalır
    expect(
      await code(requestJobPostingContact(deps, w.student, { jobPostingId: a, fields: ['EMAIL'] })),
    ).toBe('CONTACT_REQUEST_ALREADY_OPEN');
  });

  it('başka ilandaki onay yeni ilan talebinin sonucunu etkilemez', async () => {
    const w = await world();
    const a = await contactPosting(w, w.academic, 'İlan A ilanı');
    const b = await contactPosting(w, w.academic, 'İlan B ilanı');
    const first = await requestJobPostingContact(deps, w.student, {
      jobPostingId: a,
      fields: ['EMAIL'],
    });
    await respondToContactRequest(db, w.academic, {
      requestId: first.requestId,
      decision: 'APPROVE',
    });
    const independent = await requestJobPostingContact(deps, w.student, {
      jobPostingId: b,
      fields: ['EMAIL'],
    });
    expect(independent.status).toBe('PENDING');
    expect(independent.requestId).not.toBe(first.requestId);
  });
});

describe('P2-04 R2 çapraz kaynak D7 regresyonu', () => {
  it('ilan talebinden sonra bilinen PROFILE yolu yazarı ALREADY_OPEN ile ele vermez', async () => {
    const w = await world();
    const p = await published(w, w.academic, { applyMethod: 'CONTACT_REQUEST', applyUrl: null });
    const posting = await requestJobPostingContact(deps, w.student, {
      jobPostingId: p,
      fields: ['EMAIL'],
    });
    const profile = await sendContactRequest(
      db,
      w.student,
      { targetUserId: w.academic, fields: ['EMAIL'] },
      NOW,
    );
    expect(profile.status).toBe('PENDING');
    expect(profile.requestId).not.toBe(posting.requestId);
    await respondToContactRequest(
      db,
      w.academic,
      { requestId: profile.requestId, decision: 'APPROVE' },
      NOW,
    );
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: posting.requestId } })).status,
    ).toBe('PENDING');
  });
  it('aynı yazarın iki ilanı silinince yetim kaynaklar benzersizlik çakışması yaratmaz', async () => {
    const w = await world();
    const a = await published(w, w.academic, { applyMethod: 'CONTACT_REQUEST', applyUrl: null });
    const b = await published(w, w.academic, { applyMethod: 'CONTACT_REQUEST', applyUrl: null });
    const first = await requestJobPostingContact(deps, w.student, {
      jobPostingId: a,
      fields: ['EMAIL'],
    });
    const second = await requestJobPostingContact(deps, w.student, {
      jobPostingId: b,
      fields: ['EMAIL'],
    });
    await db.jobPosting.deleteMany({ where: { id: { in: [a, b] } } });
    const rows = await db.contactRequest.findMany({
      where: { id: { in: [first.requestId, second.requestId] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.jobPostingId === null && x.status === 'PENDING')).toBe(true);
  });
});

describe('okuma anında ilan görünürlüğü', () => {
  it('askı ve yazar üyeliği listeden, detaydan, süzgeçten ve doğrudan şikâyetten anında kaldırır; süresi dolan askı geri açar', async () => {
    const w = await world();
    const id = await published(w, w.alumni, {
      organizationName: 'Erişim Test Kurumu',
      location: 'Erişim Şehri',
      isRemote: true,
    });
    const visible = async () =>
      (await searchJobPostings(deps, w.student, {})).items.some((item) => item.id === id);
    const options = () => getJobPostingFilterOptions(deps, w.student);
    expect(await visible()).toBe(true);
    expect(await visibleJobPostingIds(db, [id], NOW)).toEqual([id]);
    await db.user.update({ where: { id: w.alumni }, data: { banned: true, banExpires: null } });
    expect(await visible()).toBe(false);
    expect(await visibleJobPostingIds(db, [id], NOW)).toEqual([]);
    expect(await code(getJobPosting(deps, w.student, { id }))).toBe('RESOURCE_NOT_FOUND');
    expect((await options()).organizations.some((item) => item.name === 'Erişim Test Kurumu')).toBe(
      false,
    );
    expect((await options()).locations.some((item) => item.name === 'Erişim Şehri')).toBe(false);
    expect((await options()).remoteCount).toBe(0);
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Sahte içerik' })),
    ).toBe('RESOURCE_NOT_FOUND');
    await db.user.update({
      where: { id: w.alumni },
      data: { banExpires: new Date('2030-06-20T09:00:01Z') },
    });
    expect(await visible()).toBe(false);
    await db.user.update({ where: { id: w.alumni }, data: { banExpires: NOW } });
    expect(await visible()).toBe(true);
    const membership = await db.membership.findFirstOrThrow({
      where: { userId: w.alumni, departmentId: w.inst.deptA1, role: 'ALUMNI', endedAt: null },
    });
    await db.membership.update({ where: { id: membership.id }, data: { endedAt: NOW } });
    expect(await visible()).toBe(false);
    expect(await code(getJobPosting(deps, w.student, { id }))).toBe('RESOURCE_NOT_FOUND');
    await db.membership.update({
      where: { id: membership.id },
      data: { endedAt: null, verificationStatus: 'REJECTED', verifiedAt: null },
    });
    expect(await visible()).toBe(false);
  });
  it('yabancı hedef bölüm veya eksik hedef, ilanı tüm okuyucu yüzeylerinden gizler', async () => {
    const w = await world();
    const id = await published(w, w.alumni, { organizationName: 'Hedef Kapısı Kurumu' });
    await db.jobPostingDepartment.create({
      data: { postingId: id, departmentId: w.foreign.deptA1 },
    });
    expect(
      (await searchJobPostings(deps, w.student, {})).items.some((item) => item.id === id),
    ).toBe(false);
    expect(await code(getJobPosting(deps, w.student, { id }))).toBe('RESOURCE_NOT_FOUND');
    const filters = await getJobPostingFilterOptions(deps, w.student);
    expect(filters.organizations.some((item) => item.name === 'Hedef Kapısı Kurumu')).toBe(false);
    expect(filters.departments.some((item) => item.id === w.foreign.deptA1)).toBe(false);
    await db.jobPostingDepartment.deleteMany({ where: { postingId: id } });
    expect(
      (await searchJobPostings(deps, w.student, {})).items.some((item) => item.id === id),
    ).toBe(false);
  });
  it('hiç yayımlanmadan kapatılan ve süresi dolan ilanların varlığı şikâyet yoluyla sızmaz', async () => {
    const w = await world();
    const id = await submitted(w);
    await closeJobPosting(deps, w.alumni, { postingId: id });
    expect(
      await code(reportJobPosting(deps, w.student, { postingId: id, reason: 'Sahte içerik' })),
    ).toBe('RESOURCE_NOT_FOUND');
    const expired = await submitted(w, w.academic);
    await expireJobPostings(at('2030-07-20T09:00:00Z'));
    expect(
      await code(
        reportJobPosting(at('2030-07-20T09:00:00Z'), w.student, {
          postingId: expired,
          reason: 'Sahte içerik',
        }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    const publishedId = await published(w, w.alumni);
    await closeJobPosting(deps, w.alumni, { postingId: publishedId });
    expect(
      await code(
        reportJobPosting(deps, w.student, { postingId: publishedId, reason: 'Sahte içerik' }),
      ),
    ).toBe('JOB_POSTING_NOT_OPEN');
  });
});

describe('ilan eşleşmeleri', () => {
  it('açık etiket ve uygun bölümde yayında öğrenciye eşleşme ve aynı işlemde günlük niyet yazar', async () => {
    const w = await world();
    const tag = await db.tag.create({
      data: { kind: 'INTEREST', slug: `match-${w.student}`, curated: true },
    });
    const profile = await db.profile.create({ data: { userId: w.student } });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: tag.id } });
    const id = await submitted(w, w.alumni, { tagIds: [tag.id], targetGrades: [] });
    expect(await db.jobMatch.count({ where: { postingId: id } })).toBe(0);
    await reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'PUBLISH' });
    expect(
      await db.jobMatch.findMany({ where: { postingId: id }, select: { userId: true } }),
    ).toEqual([{ userId: w.student }]);
    const intents = await db.notificationIntent.findMany({
      where: { userId: w.student, kind: 'jobMatch' },
    });
    expect(intents).toHaveLength(1);
    expect(intents[0]?.nextAttemptAt?.toISOString()).toBe('2030-06-20T21:05:00.000Z');
    // Bildirim kutusu: eşleşen öğrenciye ilana özel kayıt (okunmamış); ilan sahibi eşleşeni görmez, yalnız kendi "yayında" bildirimini alır.
    expect(
      await db.inAppNotification.findMany({
        where: { userId: w.student },
        select: { kind: true, refId: true, readAt: true },
      }),
    ).toEqual([{ kind: 'jobMatchPosting', refId: id, readAt: null }]);
    expect(
      (
        await db.inAppNotification.findMany({
          where: { userId: w.alumni },
          select: { kind: true },
        })
      ).map((row) => row.kind),
    ).toEqual(['jobPostingPublished']);
    const mine = await listMyJobPostings(deps, w.alumni, {});
    expect(JSON.stringify(mine)).not.toContain(w.student);
    expect(mine.items[0]?.matchReach).toEqual({ belowThreshold: true, count: null });
    expect((await buildDataExport(db, w.student, NOW)).jobMatches).toMatchObject([
      { postingId: id },
    ]);
    expect((await buildDataExport(db, w.alumni, NOW)).jobMatches).toEqual([]);
    const { listSuggestedJobMatches } = await import('./job-match');
    expect((await listSuggestedJobMatches(db, w.student, NOW)).map((p) => p.id)).toContain(id);
    const { listMyJobMatchNotifications } = await import('./job-match');
    expect((await listMyJobMatchNotifications(db, w.student, NOW)).map((p) => p.id)).toContain(id);
    await closeJobPosting(deps, w.alumni, { postingId: id });
    expect(await listMyJobMatchNotifications(db, w.student, NOW)).toEqual([]);
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
    expect(await db.jobMatch.count({ where: { userId: w.student } })).toBe(0);
    expect(await db.inAppNotification.count({ where: { userId: w.student } })).toBe(0);
    expect(
      await db.notificationIntent.count({ where: { userId: w.student, kind: 'jobMatch' } }),
    ).toBe(0);
  });
  it('yayın anında askıdaki yazar eşleşme ve bildirim üretmez; sonradan askıda görünür eşleşme kalmaz', async () => {
    const w = await world();
    const tag = await db.tag.create({
      data: { kind: 'INTEREST', slug: `suspended-${w.student}`, curated: true },
    });
    const profile = await db.profile.create({ data: { userId: w.student } });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: tag.id } });
    const id = await submitted(w, w.alumni, { tagIds: [tag.id], targetGrades: [] });
    await db.user.update({ where: { id: w.alumni }, data: { banned: true, banExpires: null } });
    await reviewJobPosting(deps, w.moderator, { postingId: id, decision: 'PUBLISH' });
    expect(await db.jobMatch.count({ where: { postingId: id } })).toBe(0);
    expect(
      await db.notificationIntent.count({ where: { userId: w.student, kind: 'jobMatch' } }),
    ).toBe(0);
    const match = await import('./job-match');
    expect(
      (await match.listSuggestedJobMatches(db, w.student, NOW)).map((p) => p.id),
    ).not.toContain(id);
    await db.user.update({ where: { id: w.alumni }, data: { banned: false } });
    await db.$transaction((tx) => match.stageJobMatches(tx, id, NOW));
    expect(await db.jobMatch.count({ where: { postingId: id } })).toBe(1);
    await db.user.update({ where: { id: w.alumni }, data: { banned: true, banExpires: null } });
    expect(
      (await match.listMyJobMatchNotifications(db, w.student, NOW)).map((p) => p.id),
    ).not.toContain(id);
    expect((await match.sharedJobMatchTags(db, w.student, [id], NOW)).has(id)).toBe(false);
  });
  it('etiketsiz ilan öğrenci panosunda yer alır ama bildirim niyeti oluşturmaz', async () => {
    const w = await world();
    const id = await published(w);
    const { listSuggestedJobMatches } = await import('./job-match');
    expect((await listSuggestedJobMatches(db, w.student, NOW)).map((p) => p.id)).toContain(id);
    expect(await db.jobMatch.count({ where: { postingId: id } })).toBe(0);
    expect(
      await db.notificationIntent.count({ where: { userId: w.student, kind: 'jobMatch' } }),
    ).toBe(0);
  });
});
