import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { queryCounter } from '@/test/query-counter';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { STORY_CONSENT_VERSION } from '@/contracts/alumni-story';
import { listStoryModeration } from './alumni-story';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const BODY =
  'Hikâye gövdesi: mezuniyet sonrası yolculuğumu anlatan, yeterince uzun örnek bir metin.';
const SAME_TIME = new Date('2026-05-10T09:00:00Z');

/** Bölümde 12 hikâye: puan eşitlikleri, AYNI gönderim zamanı, puansızlar, şüpheli yayımlı (görünmez) ve şüpheli bekleyen (görünür). */
async function fixture() {
  const inst = await createInstitution(db);
  const admin = await createUser(db, { name: 'Moderatör' });
  await grantRequiredConsents(db, admin);
  await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: inst.deptA1 });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  const cycle = await db.awardCycle.create({
    data: { departmentId: inst.deptA1, year: 2025, ceremonyAt: new Date('2026-06-01T09:00:00Z') },
  });
  const POINTS = [90, 90, 40, 40, 10, 10, null, null, null, null, null, null];
  const stories: { id: string; userId: string; points: number | null; at: number }[] = [];
  for (const [n, points] of POINTS.entries()) {
    const userId = await createUser(db, { name: `Mezun ${n}` });
    await addMembership(db, { userId, role: 'ALUMNI', departmentId: inst.deptA1 });
    // İlk altı hikâyenin zamanı farklı, kalanı AYNI (kimlik ikinci anahtar olmalı).
    const submittedAt = n < 6 ? new Date(SAME_TIME.getTime() + (n % 3) * 60_000) : SAME_TIME;
    const story = await db.alumniStory.create({
      data: {
        userId,
        departmentId: inst.deptA1,
        body: BODY,
        status: n % 2 === 0 ? 'PENDING' : 'PUBLISHED',
        publicConsentAt: submittedAt,
        publicConsentVersion: STORY_CONSENT_VERSION,
        submittedAt,
        ...(n % 2 === 0 ? {} : { moderatedAt: submittedAt }),
      },
      select: { id: true },
    });
    if (points !== null)
      await db.awardCandidate.create({
        data: {
          cycleId: cycle.id,
          userId,
          points,
          experienceCount: 0,
          meetingCount: 0,
          breakdown: {},
        },
      });
    stories.push({ id: story.id, userId, points, at: submittedAt.getTime() });
  }
  // 9. kullanıcı (yayımlı, puansız) şüpheli → listede görünmez; 10. (bekleyen, puansız) şüpheli → görünür.
  for (const n of [9, 10]) {
    await db.suspicionFlag.create({
      data: {
        userId: stories[n]!.userId,
        rule: 'BURST',
        status: 'OPEN',
        evidenceKey: `sayfa-${stories[n]!.id}`,
        entryIds: [],
        windowStart: new Date('2026-05-09T09:00:00Z'),
        windowEnd: SAME_TIME,
        entryCount: 5,
        points: 50,
      },
    });
  }
  const hidden = stories[9]!.id; // n=9 tek sayı → PUBLISHED + şüpheli
  const expected = stories
    .filter((s) => s.id !== hidden)
    .sort(
      (a, b) =>
        (b.points ?? -1) - (a.points ?? -1) ||
        a.at - b.at ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((s) => s.id);
  return { inst, admin, stories, expected, hidden };
}

async function crawl(
  w: Awaited<ReturnType<typeof fixture>>,
  limit: number,
  before?: (page: number, cursor: string | null) => Promise<void>,
) {
  const ids: string[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    await before?.(page, cursor);
    const result: Awaited<ReturnType<typeof listStoryModeration>> = await listStoryModeration(
      { db },
      w.admin,
      { departmentId: w.inst.deptA1, limit, ...(cursor ? { cursor } : {}) },
    );
    sizes.push(result.items.length);
    ids.push(...result.items.map((item) => item.id));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return { ids, sizes };
}

describe('hikâye moderasyonu: imleçli sayfalama', () => {
  it('sayfa boyutuyla sınırlıdır; bütün sayfalar gezilince çift/eksik yok, sıra puan ▸ zaman ▸ kimlik', async () => {
    const w = await fixture();
    const { ids, sizes } = await crawl(w, 3);
    expect(sizes).toEqual([3, 3, 3, 2]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(w.expected);
    expect(ids).not.toContain(w.hidden);
  });

  it('varsayılan sayfa boyutunda küçük bölüm tek yanıttır; imleç yoktur', async () => {
    const w = await fixture();
    const page = await listStoryModeration({ db }, w.admin, { departmentId: w.inst.deptA1 });
    expect(page.items.map((item) => item.id)).toEqual(w.expected);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({ points: 90, body: BODY });
  });

  it('imlecin gösterdiği kayıt sayfalar arasında karara bağlansa da çift/eksik olmaz', async () => {
    const w = await fixture();
    const { ids } = await crawl(w, 3, async (page) => {
      // 2. sayfayı almadan önce 1. sayfanın son kaydı reddedilir (imleç artık listede olmayan kaydı gösterir).
      if (page === 1)
        await db.alumniStory.update({
          where: { id: w.expected[2]! },
          data: { status: 'REJECTED', moderatedAt: new Date() },
        });
    });
    expect(ids).toEqual(w.expected);
  });

  it('sayfa başına sorgu sayısı sayfadan bağımsızdır (N+1 yok)', async () => {
    const w = await fixture();
    const counter = queryCounter(db);
    const counts: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 4; page++) {
      counter.reset();
      const result = await listStoryModeration({ db: counter.client }, w.admin, {
        departmentId: w.inst.deptA1,
        limit: 3,
        ...(cursor ? { cursor } : {}),
      });
      counts.push(counter.count());
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(counts.length).toBeGreaterThan(2);
    expect(new Set(counts).size).toBe(1);
  });

  it('bozuk imleç ve sınır dışı boyut doğrulamada reddedilir', async () => {
    const w = await fixture();
    for (const bad of [
      { cursor: 'x' },
      { cursor: '1:2' },
      { cursor: `1:2:${'a'.repeat(65)}` },
      { cursor: '1:2:a\u0000b' },
      { limit: 0 },
      { limit: 51 },
    ])
      await expect(
        listStoryModeration({ db }, w.admin, { departmentId: w.inst.deptA1, ...bad }),
      ).rejects.toThrow();
  });
});
