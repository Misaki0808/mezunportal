import type { ReactNode } from 'react';
import { rejectForeignFeedback } from './feedback-route';

/** Rota grubu `loading.tsx` iskeletinin üstünde: yabancı görüşme formu burada gerçek 404 olur (feedback-route.ts). */
export default async function IdentityLayout({ children }: { children: ReactNode }) {
  await rejectForeignFeedback();
  return children;
}
