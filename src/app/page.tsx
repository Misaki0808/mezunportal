import { getTranslations } from 'next-intl/server';

// Yer tutucu ana sayfa; `<main>` işaretini düzen (AppShell) verir. Tasarım sistemi ve gerçek ekranlar sonraki adımlarda gelir (P0-05, Faz 1).
export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-base leading-relaxed">{t('tagline')}</p>
    </div>
  );
}
