import { PageSkeleton } from '@/components/ui';

/** Bu rota grubunda daha özel bir `loading.tsx` yoksa ortak iskelet gösterilir (docs/design.md). */
export default function GroupLoading() {
  return <PageSkeleton />;
}
