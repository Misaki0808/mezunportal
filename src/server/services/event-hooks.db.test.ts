import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyCvSchema, type CvDecisionInput } from '@/contracts/cv';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { searchExperiencesSchema } from '@/contracts/search';
import { createTestAuth, signInWithMagicLink, uniqueAddress } from '@/test/auth';
import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { loadActor } from '../permissions/actor';
import { sendContactRequest } from './contactRequest';
import { applyCv, getCvReview, uploadCv } from './cv';
import { processCvParse } from './cv-parse';
import { settleEvents } from './event';
import { reviewExperience } from './experience';
import { getMentorEntryPoints, searchMentors } from './mentor-directory';
import { saveOnboardingStep } from './profile';
import { updateProfileBasics } from './profile-content';
import { searchExperiences } from './search';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

const events = async (userId: string, type?: string) => {
  await settleEvents();
  return db.event.findMany({
    where: { userId, ...(type ? { type: type as never } : {}) },
    orderBy: { id: 'asc' },
  });
};
async function member(role: 'STUDENT' | 'ALUMNI' = 'STUDENT', departmentId = inst.deptA1) {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId,
    role,
    ...(role === 'ALUMNI' ? { graduationYear: 2021 } : { entryYear: 2024 }),
  });
  return userId;
}
const actorOf = async (userId: string) => (await loadActor(db, userId, new Date()))!;

describe('olay kancaları', () => {
  it('giriş: oturum açılınca LOGIN olayı (yöntem e-posta bağlantısı), rol ve bölüm anlık görüntüsüyle', async () => {
    const { auth, sent } = createTestAuth(db);
    const address = uniqueAddress('ornek.test');
    const { headers } = await signInWithMagicLink(auth, sent, address);
    const userId = (await auth.api.getSession({ headers }))!.user.id;
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await signInWithMagicLink(auth, sent, address); // ikinci giriş: üyelik artık var
    const rows = await events(userId, 'LOGIN');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      role: null,
      departmentId: null,
      props: { method: 'EMAIL_LINK' },
    });
    expect(rows[1]).toMatchObject({ role: 'STUDENT', departmentId: inst.deptA1 });
    expect(JSON.stringify(rows.map((r) => r.props))).not.toContain(address);
  });

  it('deneyim araması: yalnız süzgeç TÜRLERİ ve sonuç kovası yazılır; sorgu metni ve değerleri asla', async () => {
    const userId = await member();
    const query = `gizliSorgu${randomUUID().slice(0, 8)}`;
    await searchExperiences(
      { db },
      await actorOf(userId),
      searchExperiencesSchema.parse({ q: query, types: ['INTERNSHIP'], company: 'Acme' }),
    );
    const [row] = await events(userId, 'SEARCH');
    expect(row).toMatchObject({
      role: 'STUDENT',
      departmentId: inst.deptA1,
      props: { filters: ['q', 'types', 'company'], results: 'NONE' },
    });
    expect(JSON.stringify(row)).not.toContain(query);
    expect(JSON.stringify(row)).not.toContain('Acme');
    expect(JSON.stringify(row)).not.toContain('INTERNSHIP');
  });

  it('mentor araması ve mentor profili görüntüleme olayları', async () => {
    const viewer = await member();
    const mentor = await member('ALUMNI');
    await db.mentorProfile.create({
      data: {
        userId: mentor,
        isActive: true,
        monthlyCapacity: 3,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
      },
    });
    const actor = await actorOf(viewer);
    await searchMentors(
      { db },
      actor,
      searchMentorsSchema.parse({
        mentorTypes: ['ALUMNI'],
        onlyAvailable: true,
        company: 'Gizli Şirket Adı',
      }),
    );
    const [search] = await events(viewer, 'MENTOR_SEARCH');
    expect(search!.props).toMatchObject({
      filters: ['mentorTypes', 'company', 'onlyAvailable'],
      results: 'NONE',
    });
    expect(JSON.stringify(search)).not.toContain('Gizli Şirket Adı');
    await getMentorEntryPoints({ db }, actor, { userId: mentor });
    expect(await events(viewer, 'MENTOR_VIEWED')).toHaveLength(1);
    // görünmeyen hedef için görüntüleme olayı yok
    await getMentorEntryPoints({ db }, actor, { userId: randomUUID() });
    expect(await events(viewer, 'MENTOR_VIEWED')).toHaveLength(1);
  });

  it('CV yükleme ve uygulama olayları; sayılar props’ta, içerik yok', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db);
    const upload = await uploadCv(kit.deps, actor, pdfForm());
    expect(await events(userId, 'CV_UPLOADED')).toHaveLength(1);
    await processCvParse(kit.deps, upload.cvUploadId, { retryCount: 0, retryLimit: 2 });
    const review = await getCvReview(kit.deps, actor, upload.cvUploadId);
    const decisions = review.items.map((item) => ({
      key: item.key,
      section: item.key.split(':')[0],
    })) as CvDecisionInput[];
    const result = await applyCv(
      kit.deps,
      actor,
      applyCvSchema.parse({ cvUploadId: upload.cvUploadId, decisions }),
    );
    const [applied] = await events(userId, 'CV_APPLIED');
    expect(applied!.props).toEqual({ created: result.created, updated: result.updated });
  });

  it('iletişim talebi: yalnız alan sayısı', async () => {
    const requester = await member();
    const target = await member();
    await db.fieldVisibility.create({
      data: { userId: target, field: 'EMAIL', level: 'ON_APPROVED_REQUEST' },
    });
    await db.fieldVisibility.create({
      data: { userId: target, field: 'PHONE', level: 'ON_APPROVED_REQUEST' },
    });
    await sendContactRequest(db, requester, {
      targetUserId: target,
      fields: ['EMAIL', 'PHONE'],
      message: 'Merhaba, görüşelim',
    });
    const [row] = await events(requester, 'CONTACT_REQUESTED');
    expect(row!.props).toEqual({ fieldCount: 2 });
    expect(JSON.stringify(row)).not.toContain('Merhaba');
  });

  it('deneyim yayını: adlı deneyimde yazara bağlı; ANONİM deneyimde kullanıcı, rol ve bölüm boş', async () => {
    const moderator = await member();
    await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    await grantRequiredConsents(db, moderator);
    const publish = async (author: string, isAnonymous: boolean) => {
      const row = await db.experience.create({
        data: {
          authorId: author,
          departmentIdAtWrite: inst.deptA1,
          type: 'INTERNSHIP',
          status: 'PENDING',
          isAnonymous,
          organizationName: 'Kurum',
          termYear: 2026,
          termSeason: 'SUMMER',
          durationWeeks: 8,
          pay: 'PAID',
          applicationChannel: 'COMPANY_SITE',
          whatLearned: 'Çok şey',
          advice: 'Başvur',
        },
      });
      await reviewExperience(db, moderator, { experienceId: row.id, decision: 'PUBLISH' });
    };
    const named = await member();
    const anonymous = await member();
    await publish(named, false);
    await publish(anonymous, true);
    const [namedRow] = await events(named, 'EXPERIENCE_PUBLISHED');
    expect(namedRow).toMatchObject({
      role: 'STUDENT',
      departmentId: inst.deptA1,
      props: { experienceType: 'INTERNSHIP', anonymous: false },
    });
    expect(await events(anonymous, 'EXPERIENCE_PUBLISHED')).toEqual([]);
    const orphans = await db.event.findMany({
      where: { type: 'EXPERIENCE_PUBLISHED', userId: null, role: null, departmentId: null },
    });
    expect(orphans.some((row) => (row.props as { anonymous?: boolean }).anonymous === true)).toBe(
      true,
    );
  });

  it('profil eşiği: profil yazımı yukarı yönde eşiği geçince PROFILE_THRESHOLD bir kez yazılır', async () => {
    const userId = await member();
    await db.profile.create({ data: { userId, completionScore: 40 } });
    // Temel alanlar + ilk giriş adımlarını tamamlamak skoru artırır; eşiği geçen en az bir yazım olmalı.
    await updateProfileBasics({ db }, userId, { headline: 'Başlık', city: 'Ankara' });
    const after = (await db.profile.findUniqueOrThrow({ where: { userId } })).completionScore;
    const thresholds = (await events(userId, 'PROFILE_THRESHOLD')).map(
      (e) => (e.props as { threshold: number }).threshold,
    );
    expect(new Set(thresholds).size).toBe(thresholds.length);
    for (const t of thresholds) expect(after).toBeGreaterThanOrEqual(t);
    expect(thresholds.every((t) => t > 40)).toBe(true);
    void saveOnboardingStep;
  });
});
