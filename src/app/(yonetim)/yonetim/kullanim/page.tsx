import { ErrorState } from '@/components/ui';
import { MetricsPanel } from '@/components/metrics/metrics-panel';
import { getAdminOverview } from '@/server/actions/admin';
import { getUsageMetrics } from '@/server/actions/metrics';

export const dynamic = 'force-dynamic';
export default async function UsageMetricsPage() {
  const today = new Date();
  const toDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const fromDay = new Date(toDay.getTime() - 29 * 86_400_000);
  const initialFilter = { from: fromDay, to: new Date(toDay.getTime() + 86_400_000) };
  const [overview, metrics] = await Promise.all([
    getAdminOverview(),
    getUsageMetrics(initialFilter),
  ]);
  if (!overview.ok) return <ErrorState errorCode={overview.errorCode} />;
  if (!metrics.ok) return <ErrorState errorCode={metrics.errorCode} />;
  return (
    <MetricsPanel
      initial={metrics.data}
      initialFilter={initialFilter}
      departments={overview.data.departments}
    />
  );
}
