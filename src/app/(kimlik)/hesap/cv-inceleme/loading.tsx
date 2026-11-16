import { Skeleton } from '@/components/ui';
export default function Loading() {
  return (
    <div className="w-full max-w-xl space-y-5">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
