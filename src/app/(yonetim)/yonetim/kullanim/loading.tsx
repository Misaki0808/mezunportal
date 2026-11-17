import { Skeleton } from '@/components/ui';
export default function Loading() {
  return (
    <div className="min-w-0 space-y-5">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
