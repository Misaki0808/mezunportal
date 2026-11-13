'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import type { FaqItemView, FaqSearchPage } from '@/contracts/faq';
import { FAQ_MY_REQUESTS_HREF, FAQ_PAGE_HREF } from '@/contracts/faq';
import { Button, buttonClasses, EmptyState, Input, Pagination } from '@/components/ui';

import { formatDate } from './format';

/** Yayınlanan SSS kaydı: kimlik yok (sözleşme yalnız soru, cevap, tarih verir). Yanıt `<details>` ile açılır. */
export function FaqItemCard({ item, open }: { item: FaqItemView; open?: boolean }) {
  return (
    <article className="rounded-card border border-border p-4">
      <details open={open} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 text-lg font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.question}</span>
          <span aria-hidden="true" className="mt-1 shrink-0 text-fg-muted group-open:rotate-180">
            ▾
          </span>
        </summary>
        <p className="mt-3 whitespace-pre-line text-base text-fg [overflow-wrap:anywhere]">
          {item.answer}
        </p>
        <p className="mt-3 text-sm text-fg-muted">{formatDate(item.publishedAt)}</p>
      </details>
    </article>
  );
}

function hrefFor(q: string | undefined) {
  return (page: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `${FAQ_PAGE_HREF}?${query}` : FAQ_PAGE_HREF;
  };
}

/** SSS sayfası ve araması (sunucu bileşeni; arama GET formudur, durum URL'de, JS gerekmez). */
export function FaqList({
  result,
  q,
  canAsk,
}: {
  result: FaqSearchPage;
  q?: string;
  canAsk: boolean;
}) {
  const t = useTranslations('faq');
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 px-5 pb-12 pt-10 sm:pt-14">
      <div>
        <p className="font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
        <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      </div>
      <form
        role="search"
        action={FAQ_PAGE_HREF}
        method="get"
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-fg-muted">
          {t('searchLabel')}
          <Input name="q" type="search" defaultValue={q ?? ''} minLength={2} maxLength={100} />
        </label>
        <Button type="submit" className="sm:self-end">
          {t('search')}
        </Button>
      </form>
      {canAsk && (
        <Link className={buttonClasses({ variant: 'secondary' })} href={FAQ_MY_REQUESTS_HREF}>
          {t('askLink')}
        </Link>
      )}
      {(result.total > 0 || q) && (
        <p role="status" className="text-sm text-fg-muted">
          {q
            ? t('resultCountFor', { count: result.total, q })
            : t('resultCount', { count: result.total })}
        </p>
      )}
      {result.items.length === 0 ? (
        <EmptyState
          title={q ? t('empty') : t('emptyAll')}
          description={q ? t('emptySearch') : t('emptyAllHint')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.items.map((item) => (
            <li key={item.id}>
              <FaqItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} pageCount={pageCount} hrefFor={hrefFor(q)} />
    </div>
  );
}
