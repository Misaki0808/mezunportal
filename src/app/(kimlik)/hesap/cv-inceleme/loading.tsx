import { Skeleton } from '@/components/ui';
export default function Loading() {
  return (
    <div className="mx-auto max-w-xl space-y-5 px-5 py-10">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
