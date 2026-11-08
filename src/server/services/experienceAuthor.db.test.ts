import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

import * as service from './experience';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const NOW = new Date('2026-11-08T01:00:00Z');

let inst: Awaited<ReturnType<typeof createInstitution>>;
let reader: string;
let moderator: string;

async function student(overrides: Parameters<typeof createUser>[1] = {}) {
  const id = await createUser(db, overrides);
  await addMembership(db, {
    userId: id,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  return id;
}

beforeAll(async () => {
  inst = await createInstitution(db);
  reader = await student();
  moderator = await student();
  await grantRequiredConsents(db, moderator);
  await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
});

async function publishedNamed(authorId: string) {
  const row = await db.experience.create({
    data: {
      authorId,
      departmentIdAtWrite: inst.deptA1,
      type: 'CERTIFICATE',
      organizationName: 'Kurum',
      termYear: 2025,
      termSeason: 'SUMMER',
      whatLearned: 'x',
      advice: 'y',
      isAnonymous: false,
      status: 'PUBLISHED',
      publishedAt: NOW,
      moderatedById: moderator,
      moderatedAt: NOW,
    },
  });
  return row.id;
}

describe('askıdaki/silinmiş yazarın adı deneyim detayında da gizlidir (aramayla aynı kural)', () => {
  it('etkin yazar görünür', async () => {
    const author = await student({ name: 'Görünen Yazar' });
    const id = await publishedNamed(author);
    const detail = await service.getExperienceDetail(db, reader, { experienceId: id }, NOW);
    expect(detail).toMatchObject({
      isAnonymous: false,
      author: { id: author, displayName: 'Görünen Yazar' },
    });
  });

  it.each([
    ['süresiz askı', { banned: true }],
    ['süren süreli askı', { banned: true, banExpires: new Date('2026-12-01') }],
    ['silinmiş hesap', { deletedAt: new Date('2026-10-01') }],
  ])(
    '%s: içerik kalır, yazar adı ve kimliği yanıtta yoktur (okuyucu ve moderatör)',
    async (_name, state) => {
      const author = await student({ name: 'Gizlenecek Yazar', ...state });
      const id = await publishedNamed(author);
      for (const viewer of [reader, moderator]) {
        const detail = await service.getExperienceDetail(db, viewer, { experienceId: id }, NOW);
        expect(detail.isAnonymous).toBe(true);
        expect('author' in detail).toBe(false);
        const text = JSON.stringify(detail);
        expect(text).not.toContain('Gizlenecek Yazar');
        expect(text).not.toContain(author);
      }
    },
  );

  it('askı süresi dolunca yazar yeniden görünür', async () => {
    const author = await student({
      name: 'Askısı Bitti',
      banned: true,
      banExpires: new Date('2026-11-01'),
    });
    const id = await publishedNamed(author);
    const detail = await service.getExperienceDetail(db, reader, { experienceId: id }, NOW);
    expect(detail).toMatchObject({ isAnonymous: false, author: { displayName: 'Askısı Bitti' } });
  });

  it('moderasyon kuyruğu da aynı kuralı uygular', async () => {
    const author = await student({ name: 'Kuyruk Yazar', banned: true });
    const row = await db.experience.create({
      data: {
        authorId: author,
        departmentIdAtWrite: inst.deptA1,
        type: 'CERTIFICATE',
        organizationName: 'Kurum',
        termYear: 2025,
        termSeason: 'SUMMER',
        whatLearned: 'x',
        advice: 'y',
        isAnonymous: false,
        status: 'PENDING',
      },
    });
    const page = await service.listModerationQueue(db, moderator, { limit: 50 }, NOW);
    const item = page.items.find((candidate) => candidate.id === row.id)!;
    expect(item.isAnonymous).toBe(true);
    expect(JSON.stringify(item)).not.toContain('Kuyruk Yazar');
  });
});
