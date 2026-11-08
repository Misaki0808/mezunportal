import 'server-only';

import {
  COMPLETION_FIELDS,
  listProfileTagsSchema,
  saveOnboardingStepSchema,
  skipOnboardingStepSchema,
  type CompletionField,
  type ListProfileTagsInput,
  type OnboardingState,
  type ProfileTagsOutput,
  type SaveOnboardingStepInput,
  type SkipOnboardingStepInput,
} from '@/contracts/profile';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedValidation } from '@/lib/errors';

import { errorForDenyReason, loadActor } from '../permissions';
import { evaluateAccess } from '../rules/authorization';
import { computeClassStanding } from '../rules/classYear';
import {
  computeProfileCompletion,
  finishOnboarding,
  nextOnboardingStep,
  stepStatuses,
  studentMentorEligibility,
} from '../rules/profileCompletion';

const profileSelect = {
  id: true,
  onboardingStep: true,
  completedSteps: true,
  skippedSteps: true,
  mentorInterested: true,
  tags: { select: { tagId: true, tag: { select: { kind: true } } }, orderBy: { tagId: 'asc' } },
} satisfies Prisma.ProfileSelect;
type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof profileSelect }>;
type Change = { save: SaveOnboardingStepInput } | { skip: SkipOnboardingStepInput };

async function requireCurrentUser(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const actor = await loadActor(tx, userId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'selfProfile' });
  if (!decision.allowed) throw errorForDenyReason(decision.reason);
}

/** Tercih kaydı yetki vermez; MentorProfile açılmaz ve hiçbir üyelik doğrulanmaz. */
async function membershipFacts(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const memberships = await tx.membership.findMany({
    where: { userId, endedAt: null, verificationStatus: { not: 'REJECTED' } },
    select: { role: true, entryYear: true, classOffset: true },
  });
  const students = memberships.filter((membership) => membership.role === 'STUDENT');
  const publishedExperienceCount = await tx.experience.count({
    where: { authorId: userId, status: 'PUBLISHED' },
  });
  const eligibilities = students.map((membership) =>
    studentMentorEligibility(computeClassStanding(membership, now), publishedExperienceCount),
  );
  const studentEligibility =
    eligibilities.find((eligibility) => eligibility.eligible) ??
    eligibilities.find(
      (eligibility) => !eligibility.eligible && eligibility.reason === 'EXPERIENCE_UNAVAILABLE',
    ) ??
    eligibilities[0] ??
    null;
  return {
    membershipCompleted: memberships.length > 0,
    mentorStepAvailable:
      memberships.some(
        (membership) => membership.role === 'ALUMNI' || membership.role === 'ACADEMIC',
      ) || studentEligibility?.eligible === true,
    studentEligibility,
  };
}
type MembershipFacts = Awaited<ReturnType<typeof membershipFacts>>;

function stateOf(profile: ProfileRow, facts: MembershipFacts): OnboardingState {
  const statuses = stepStatuses({
    completed: COMPLETION_FIELDS.filter((step) => profile.completedSteps.includes(step)),
    skipped: COMPLETION_FIELDS.filter((step) => profile.skippedSteps.includes(step)),
  });
  statuses.MEMBERSHIP = facts.membershipCompleted ? 'COMPLETED' : 'PENDING';
  const steps = COMPLETION_FIELDS.map((step) => ({
    step,
    status: statuses[step],
    skippable: step !== 'MEMBERSHIP',
    applicable: step !== 'MENTOR_PREFERENCE' || facts.mentorStepAvailable,
  }));
  return {
    step: profile.onboardingStep,
    steps,
    interestTagIds: profile.tags
      .filter(({ tag }) => tag.kind === 'INTEREST')
      .map(({ tagId }) => tagId),
    goalTagIds: profile.tags.filter(({ tag }) => tag.kind === 'GOAL').map(({ tagId }) => tagId),
    mentorInterested: profile.mentorInterested,
    studentMentorEligibility: facts.studentEligibility,
    completion: computeProfileCompletion(statuses, {
      mentorStepAvailable: facts.mentorStepAvailable,
    }),
  };
}

function nextStep(step: CompletionField, facts: MembershipFacts): OnboardingState['step'] {
  const next = nextOnboardingStep(step);
  return next === 'MENTOR_PREFERENCE' && !facts.mentorStepAvailable ? 'VISIBILITY' : next;
}

/** User kilidi hesap silmeyle ve eşzamanlı kaydetmelerle ortaktır; yetki kilitten sonra yeniden okunur. */
async function runOnboarding(
  db: PrismaClient,
  userId: string,
  change?: Change,
  now: Date = new Date(),
): Promise<OnboardingState> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await requireCurrentUser(tx, userId, now);
    const facts = await membershipFacts(tx, userId, now);
    let profile = await tx.profile.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: profileSelect,
    });
    const completed = new Set(profile.completedSteps);
    const skipped = new Set(profile.skippedSteps);
    if (facts.membershipCompleted) completed.add('MEMBERSHIP');
    else completed.delete('MEMBERSHIP');
    let cursor = profile.onboardingStep;
    if (change) {
      const save = 'save' in change ? saveOnboardingStepSchema.parse(change.save) : null;
      const input =
        save ?? skipOnboardingStepSchema.parse('skip' in change ? change.skip : undefined);
      if (save?.step === 'COMPLETE') {
        const finished = finishOnboarding({
          completed: COMPLETION_FIELDS.filter((step) => completed.has(step)),
          skipped: COMPLETION_FIELDS.filter((step) => skipped.has(step)),
        });
        if (!finished.ok) throw codedValidation(finished.errorCode);
        for (const step of finished.lists.skipped) skipped.add(step);
        cursor = 'COMPLETE';
      } else {
        // COMPLETE yalnız save biçiminde olabilir; ayrıştırılmış ayrık birleşim yukarıda ele alındı.
        const step = input.step as CompletionField;
        if (save) {
          if ('tagIds' in save) {
            const kind = step === 'INTERESTS' ? 'INTEREST' : 'GOAL';
            const tags = await tx.tag.findMany({
              where: { id: { in: save.tagIds }, kind },
              select: { id: true },
            });
            if (tags.length !== save.tagIds.length) throw codedValidation('PROFILE_TAG_INVALID');
            await tx.profileTag.deleteMany({ where: { profileId: profile.id, tag: { kind } } });
            await tx.profileTag.createMany({
              data: tags.map(({ id }) => ({ profileId: profile.id, tagId: id })),
            });
          } else if ('interested' in save) {
            // İstemciden sınıf/rol/deneyim sayısı alınmaz. Gizli adımı doğrudan çağırmak da reddedilir.
            if (!facts.mentorStepAvailable) throw codedValidation('MENTOR_NOT_ELIGIBLE');
            await tx.profile.update({
              where: { id: profile.id },
              data: { mentorInterested: save.interested },
            });
          }
          skipped.delete(step);
          completed.add(step);
        } else {
          completed.delete(step);
          skipped.add(step); // Etiketleri, mentor tercihini ve görünürlük değerlerini KORU.
        }
        if (cursor !== 'COMPLETE') cursor = nextStep(step, facts);
      }
    }
    if (!facts.membershipCompleted) cursor = 'MEMBERSHIP';
    else if (cursor === 'MEMBERSHIP') cursor = nextStep('MEMBERSHIP', facts);
    else if (cursor === 'MENTOR_PREFERENCE' && !facts.mentorStepAvailable) cursor = 'VISIBILITY';
    profile = await tx.profile.update({
      where: { id: profile.id },
      data: { onboardingStep: cursor, completedSteps: [...completed], skippedSteps: [...skipped] },
      select: profileSelect,
    });
    const state = stateOf(profile, facts);
    await tx.profile.update({
      where: { id: profile.id },
      data: { completionScore: state.completion.percent },
    });
    return state;
  });
}

export async function getOnboardingState(db: PrismaClient, userId: string, now?: Date) {
  return runOnboarding(db, userId, undefined, now);
}
export async function saveOnboardingStep(
  db: PrismaClient,
  userId: string,
  input: SaveOnboardingStepInput,
  now?: Date,
) {
  return runOnboarding(db, userId, { save: input }, now);
}
export async function skipOnboardingStep(
  db: PrismaClient,
  userId: string,
  input: SkipOnboardingStepInput,
  now?: Date,
) {
  return runOnboarding(db, userId, { skip: input }, now);
}
export async function listProfileTags(
  db: PrismaClient,
  userId: string,
  input: ListProfileTagsInput,
): Promise<ProfileTagsOutput> {
  return db.$transaction(async (tx) => {
    await requireCurrentUser(tx, userId, new Date());
    const { kind } = listProfileTagsSchema.parse(input);
    return {
      tags: await tx.tag.findMany({
        where: { kind, ...(kind === 'SKILL' ? { curated: true } : {}) },
        select: { id: true, kind: true, slug: true },
        orderBy: { slug: 'asc' },
      }),
    };
  });
}

/** Salt-okunur ilk giriş özeti (adım durumları + mentor adımı uygulanabilirliği); profil satırı açmaz. */
export async function onboardingSnapshot(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const facts = await membershipFacts(tx, userId, now);
  const profile = await tx.profile.findUnique({ where: { userId }, select: profileSelect });
  const state = stateOf(
    profile ?? {
      id: '',
      onboardingStep: 'MEMBERSHIP',
      completedSteps: [],
      skippedSteps: [],
      mentorInterested: null,
      tags: [],
    },
    facts,
  );
  return {
    statuses: Object.fromEntries(state.steps.map((step) => [step.step, step.status])) as Record<
      CompletionField,
      'COMPLETED' | 'SKIPPED' | 'PENDING'
    >,
    mentorStepAvailable: facts.mentorStepAvailable,
  };
}
