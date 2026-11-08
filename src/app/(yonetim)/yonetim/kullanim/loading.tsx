import { Skeleton } from '@/components/ui';
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-10">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
