import { notFound } from 'next/navigation';

import { isDevToolsEnabled } from '@/lib/app-env';

import { Gallery } from './gallery';

// Her istekte değerlendirilir: derleme anındaki APP_ENV'e bağlı kalmaz, `prod`'da 404 verir.
export const dynamic = 'force-dynamic';

export default function UiExamplesPage() {
  if (!isDevToolsEnabled()) notFound();
  return <Gallery />;
}
