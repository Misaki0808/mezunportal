import { ErrorState } from '@/components/ui';

/**
 * Kök 404. Rota grubu layout'larından fırlatılan `notFound()` (ör. (kimlik)/layout.tsx'teki yabancı görüşme formu) bir
 * ÜST sınıra gider, yani gruptaki `not-found.tsx`'e değil buraya; bu dosya yoksa Next.js İngilizce varsayılan sayfayı verirdi.
 * Bilinmeyen adresler de aynı Türkçe ekranı alır.
 */
export default function RootNotFound() {
  return <ErrorState errorCode="RESOURCE_NOT_FOUND" />;
}
