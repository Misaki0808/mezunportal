'use client';

import Link from 'next/link';
import messages from '../../messages/tr.json';
import './globals.css';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = messages.errorBoundary;
  return (
    <html lang="tr">
      <body>
        <header className="border-b border-border px-5 py-4 text-xl font-semibold text-primary">
          MezunPortal
        </header>
        <main className="mx-auto max-w-xl px-5 py-16">
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="mt-4 text-fg-muted">{t.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-control bg-primary px-5 font-semibold text-on-primary"
              onClick={reset}
            >
              {t.retry}
            </button>
            <Link
              className="inline-flex min-h-11 items-center rounded-control border border-border px-5"
              href="/"
            >
              {t.home}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
