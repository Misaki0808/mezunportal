import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getFeedbackView } from '@/server/actions/feedback';

const FEEDBACK_PATH = /^\/hesap\/gorusme\/([^/]+)\/?$/;

/**
 * Görüşme formu adresindeyse randevu kimliğini döndürür; başka bir adresse `null`. Kimlik URL kodlaması bozuksa
 * (ör. `%E0%A4%A`) form hiç yok sayılır ve gerçek 404 verilir. Yol yalnız proxy'nin yazdığı başlıktan okunur.
 */
export async function feedbackRouteId(): Promise<string | null> {
  const path = (await headers()).get(REQUEST_PATH_HEADER)?.split('?')[0] ?? '';
  const match = FEEDBACK_PATH.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    notFound();
  }
}

/**
 * Başka katılımcının (ya da olmayan) görüşme formu için GERÇEK 404. Bu denetim `(kimlik)/loading.tsx` sınırının ÜSTÜNDE
 * (rota grubu layout'unda) koşmalıdır: `loading.tsx` altında fırlatılan `notFound()` iskelet gönderildikten sonra olur ve
 * durum kodu 200 kalır. Yalnız "yok/yetkisiz" sonuçları 404 yapar; oturum, onay ya da zamanlama hataları hesap layout'unun
 * kendi kapısına bırakılır. Taraf kararı her zaman servisindir (`feedbackView`); burada yetki varsayılmaz.
 */
export async function rejectForeignFeedback(): Promise<void> {
  const id = await feedbackRouteId();
  if (id === null) return;
  const result = await getFeedbackView(id);
  if (
    !result.ok &&
    (result.errorCode === 'RESOURCE_NOT_FOUND' || result.errorCode === 'AUTH_FORBIDDEN')
  )
    notFound();
}
