import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { ErrorState } from '@/components/ui';
import { getRequestFeedbackView } from '@/app/(kimlik)/feedback-view';
import { feedbackRouteId } from '../feedback-route';

/**
 * Oturum/onay kapısı ve formun zamanlama/sunucu hatası ekranı. Yabancı formun durum kodu 404 olan yanıtı bir üst
 * layout'ta (`(kimlik)/layout.tsx`, loading sınırının üstü) verilir; buradaki `notFound()` yalnız savunma katmanıdır
 * (loading altında 200 kalır ama içerik yine verisizdir).
 */
export default async function ConsentLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  const id = await feedbackRouteId();
  if (id !== null) {
    const result = await getRequestFeedbackView(id);
    if (!result.ok) {
      if (result.errorCode === 'RESOURCE_NOT_FOUND' || result.errorCode === 'AUTH_FORBIDDEN')
        notFound();
      return <ErrorState errorCode={result.errorCode} />;
    }
  }
  return guarded;
}
