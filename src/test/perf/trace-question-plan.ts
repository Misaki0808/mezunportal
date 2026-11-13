import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getInterviewQuestions } from '@/server/services/interview-questions';

/** Gerçek Prisma sorgularını yalnız sentetik performans verisinde yakalar ve buffer planını alır. */
export async function questionPlans(viewer: string, companyId = ''): Promise<string[]> {
  const trace = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST! }),
    log: [{ emit: 'event', level: 'query' }],
  });
  const statements: { sql: string; params: unknown[] }[] = [];
  trace.$on('query', (event) => {
    if (/^\s*SELECT\b/i.test(event.query) && /"Experience"/i.test(event.query)) {
      statements.push({ sql: event.query, params: JSON.parse(event.params) as unknown[] });
    }
  });
  try {
    await getInterviewQuestions(trace, viewer, { q: '', companyId, sectorId: '' });
    const plans: string[] = [];
    for (const statement of [...statements]) {
      const rows = await trace.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) ${statement.sql}`,
        ...statement.params,
      );
      plans.push(rows.map((row) => row['QUERY PLAN']).join('\n'));
    }
    return plans;
  } finally {
    await trace.$disconnect();
  }
}
