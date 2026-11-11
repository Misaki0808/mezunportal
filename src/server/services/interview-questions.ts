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

const PAGE_SIZE = 10;

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
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const [companyOptions, sectors, experiences, identityContext] = await Promise.all([
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
        // Bir kaynağın geri çekilmesi veya yazarın askıya alınması, diğer metinlerdeki adını açmaz.
        // Kimlik bağlamı yalnız engelleme içindir; sorular ve sayımlar yukarıdaki görünür kaynaklardan gelir.
        tx.experience.findMany({
          where: {
            companyId: { in: companies.map((c) => c.id) },
            department: { faculty: { universityId: { in: universities } } },
          },
          select: {
            id: true,
            companyId: true,
            status: true,
            author: { select: { id: true, name: true, email: true } },
          },
        }),
      ]);
      // Yayımlanmamış özel bir taslak diğer yazarların sorularını bastıramaz.
      // Geçmiş yayın kanıtı zaten tutulan, yalnız eklenebilen moderasyon kaydından gelir.
      const inactiveIds = identityContext
        .filter((exp) => exp.status !== 'PUBLISHED')
        .map((exp) => exp.id);
      const pastPublications = inactiveIds.length
        ? await tx.adminAuditLog.findMany({
            where: {
              action: 'MODERATION_PUBLISH',
              targetType: 'EXPERIENCE',
              targetId: { in: inactiveIds },
            },
            select: { targetId: true },
          })
        : [];
      const previouslyPublished = new Set(pastPublications.map((row) => row.targetId));
      const candidates = new Map<string, QuestionCandidate[]>();
      const authors = new Map<string, Set<string>>();
      const companyNames = new Map<string, Set<string>>();
      const companyIdentifiers = new Map<string, Set<string>>();
      for (const exp of identityContext) {
        if (!exp.companyId || !exp.author) continue;
        if (exp.status !== 'PUBLISHED' && !previouslyPublished.has(exp.id)) continue;
        const names = companyNames.get(exp.companyId) ?? new Set<string>();
        names.add(exp.author.name);
        companyNames.set(exp.companyId, names);
        const identifiers = companyIdentifiers.get(exp.companyId) ?? new Set<string>();
        identifiers.add(exp.author.id);
        identifiers.add(exp.author.email);
        identifiers.add(exp.id);
        companyIdentifiers.set(exp.companyId, identifiers);
      }
      for (const exp of experiences) {
        if (!exp.companyId || !exp.author) continue;
        const companyCandidates = candidates.get(exp.companyId) ?? [];
        const companyAuthors = authors.get(exp.companyId) ?? new Set<string>();
        companyAuthors.add(exp.author.id);
        authors.set(exp.companyId, companyAuthors);
        const add = (text: unknown, category: QuestionCandidate['category']) => {
          if (typeof text !== 'string' || !text.trim()) return;
          const clean = text.trim();
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
        // Aynı soru çok sayıda deneyimde tekrarlanabilir; kimlik sonucu bu istek/şirket içinde aynıdır.
        const safeTexts = new Map<string, boolean>();
        const safeCandidates = (candidates.get(company.id) ?? []).filter((candidate) => {
          const cached = safeTexts.get(candidate.text);
          if (cached !== undefined) return cached;
          const identity = analyzeIdentity(candidate.text, names, identifiers);
          // Harf/rakam aralarına boşluk koymak e-posta veya telefonu yayımlanabilir yapmaz.
          const compactIdentity = analyzeIdentity(
            candidate.text.replace(/\s+/gu, ''),
            [],
            identifiers,
          );
          const safe =
            !identity.blocked && identity.warnings.length === 0 && !compactIdentity.blocked;
          safeTexts.set(candidate.text, safe);
          return safe;
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
      // Gizlilik denetiminden önce saymak veya sayfalamak küçük grupları sızdırabilir.
      const total = groups.length;
      const page = Math.min(filters.page ?? 1, Math.max(1, Math.ceil(total / PAGE_SIZE)));
      return interviewQuestionBankSchema.parse({
        companies: companyOptions,
        sectors,
        groups: groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        total,
        page,
        pageSize: PAGE_SIZE,
        insufficient: companies.some((c) => {
          const count = authors.get(c.id)?.size ?? 0;
          return count > 0 && count < QUESTION_MIN_AUTHORS;
        }),
      });
    },
    { isolationLevel: 'RepeatableRead', timeout: 20000, maxWait: 10000 },
  );
}
