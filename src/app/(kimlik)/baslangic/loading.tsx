import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-5 py-12" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
