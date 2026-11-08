import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  interviewQuestionBankSchema,
  type InterviewFilters,
  type InterviewQuestionBank,
} from '@/contracts/interview-questions';
import { createPermissions } from '../permissions/guards';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';
import { notSuspended } from './mentor-directory';
import { companySlug } from './companies';
import { analyzeIdentity, foldTr } from '../rules/faq';
import {
  groupQuestions,
  QUESTION_MIN_AUTHORS,
  type QuestionCandidate,
} from '../rules/questionDedupe';

export async function getInterviewQuestions(
  db: PrismaClient,
  userId: string,
  filters: InterviewFilters,
): Promise<InterviewQuestionBank> {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      const actor = await createPermissions({
        db: () => tx,
        getSessionUserId: async () => userId,
        now: () => now,
      }).requireVerifiedMember();
      await requireConsent(tx, userId);
      const universities = await viewerUniversityIds(tx, actor);
      const companies = await tx.company.findMany({
        where: {
          ...(filters.companyId ? { id: filters.companyId } : {}),
          ...(filters.sectorId ? { sectorId: filters.sectorId } : {}),
        },
        select: { id: true, name: true, sectorId: true, sector: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      const [companyOptions, sectors, experiences] = await Promise.all([
        tx.company.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        tx.sector.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.experience.findMany({
          where: {
            companyId: { in: companies.map((c) => c.id) },
            status: 'PUBLISHED',
            department: { faculty: { universityId: { in: universities } } },
            author: { is: { deletedAt: null, ...notSuspended(now) } },
          },
          select: {
            id: true,
            companyId: true,
            interviewQuestions: true,
            processSteps: true,
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { id: 'asc' },
        }),
      ]);
      const candidates = new Map<string, QuestionCandidate[]>();
      const authors = new Map<string, Set<string>>();
      const companyNames = new Map<string, Set<string>>();
      const companyIdentifiers = new Map<string, Set<string>>();
      for (const exp of experiences) {
        if (!exp.companyId || !exp.author) continue;
        const companyCandidates = candidates.get(exp.companyId) ?? [];
        const companyAuthors = authors.get(exp.companyId) ?? new Set<string>();
        companyAuthors.add(exp.author.id);
        authors.set(exp.companyId, companyAuthors);
        const names = companyNames.get(exp.companyId) ?? new Set<string>();
        names.add(exp.author.name);
        companyNames.set(exp.companyId, names);
        const identifiers = companyIdentifiers.get(exp.companyId) ?? new Set<string>();
        identifiers.add(exp.author.id);
        identifiers.add(exp.author.email);
        identifiers.add(exp.id);
        companyIdentifiers.set(exp.companyId, identifiers);
        const add = (text: unknown, category: QuestionCandidate['category']) => {
          if (typeof text !== 'string' || !text.trim()) return;
          const clean = text.trim();
          const identity = analyzeIdentity(
            clean,
            [exp.author!.name],
            [exp.author!.id, exp.author!.email, exp.id],
          );
          if (identity.blocked || identity.warnings.length) return;
          companyCandidates.push({
            text: clean,
            category,
            experienceId: exp.id,
            authorId: exp.author!.id,
          });
        };
        for (const question of exp.interviewQuestions) add(question, 'QUESTION');
        if (Array.isArray(exp.processSteps))
          for (const step of exp.processSteps) {
            if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
            add(step.description, 'PROCESS');
          }
        candidates.set(exp.companyId, companyCandidates);
      }
      const needle = foldTr(filters.q);
      const groups = companies.flatMap((company) => {
        if ((authors.get(company.id)?.size ?? 0) < QUESTION_MIN_AUTHORS) return [];
        const names = [...(companyNames.get(company.id) ?? [])];
        const identifiers = [...(companyIdentifiers.get(company.id) ?? [])];
        const safeCandidates = (candidates.get(company.id) ?? []).filter((candidate) => {
          const identity = analyzeIdentity(candidate.text, names, identifiers);
          return !identity.blocked && identity.warnings.length === 0;
        });
        const questions = groupQuestions(safeCandidates).filter(
          (question) =>
            !needle ||
            foldTr(question.text).includes(needle) ||
            foldTr(company.name).includes(needle),
        );
        return questions.length
          ? [
              {
                companyId: company.id,
                companyName: company.name,
                companySlug: companySlug(company.name, company.id),
                sector: company.sector?.name ?? null,
                questions,
              },
            ]
          : [];
      });
      return interviewQuestionBankSchema.parse({
        companies: companyOptions,
        sectors,
        groups,
        insufficient: companies.some((c) => {
          const count = authors.get(c.id)?.size ?? 0;
          return count > 0 && count < QUESTION_MIN_AUTHORS;
        }),
      });
    },
    { isolationLevel: 'RepeatableRead', timeout: 20000, maxWait: 10000 },
  );
}
