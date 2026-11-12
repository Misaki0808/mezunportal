import 'server-only';

import type { Prisma, ReportStatus } from '@/generated/prisma/client';

/** Liste ve sayaç aynı hedef bölüm kapsamını kullanır; çok hedefli ilan şikâyeti tek satırdır. */
export function jobPostingReportScopeWhere(
  departmentIds: readonly string[],
  status: ReportStatus,
): Prisma.JobPostingReportWhereInput {
  return {
    status,
    posting: {
      targets: { some: { departmentId: { in: [...departmentIds] } } },
    },
  };
}
