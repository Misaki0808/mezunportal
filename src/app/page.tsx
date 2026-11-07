import { getTranslations } from 'next-intl/server';

// Yer tutucu ana sayfa. Tasarım sistemi ve gerçek ekranlar sonraki adımlarda gelir (P0-05, Faz 1).
export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-base leading-relaxed">{t('tagline')}</p>
    </main>
  );
}
