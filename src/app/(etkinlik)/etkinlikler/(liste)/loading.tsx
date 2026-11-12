import { PageSkeleton } from '@/components/ui';

/**
 * Yalnız LİSTE sayfasını sarar: `(liste)` rota alt grubu `[id]` sayfasını kapsam dışı bırakır. Bir `loading.tsx` altında
 * fırlatılan `notFound()` durum kodunu 200'de bırakır (iskelet önce gider); etkinlik ayrıntısı bilinmeyen kimlikte GERÇEK 404
 * vermeye devam etmeli (tests/e2e/not-found-status.spec.ts).
 */
export default function Loading() {
  return <PageSkeleton />;
}
