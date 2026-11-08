'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  FaqSuggestion,
  ListMyFaqRequestsInput,
  MyFaqRequestPage,
  SubmitFaqRequestInput,
  SubmitFaqRequestOutput,
  SuggestSimilarFaqsInput,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';

import { MyRequests } from './my-requests';
import { RequestForm } from './request-form';

type Props = {
  initial: MyFaqRequestPage;
  suggest: (input: SuggestSimilarFaqsInput) => Promise<ActionResult<FaqSuggestion[]>>;
  submit: (input: SubmitFaqRequestInput) => Promise<ActionResult<SubmitFaqRequestOutput>>;
  list: (input: ListMyFaqRequestsInput) => Promise<ActionResult<MyFaqRequestPage>>;
};

/** “SSS talebi gönder” + taleplerim (öğrenci). Gönderimden sonra liste baştan yüklenir. */
export function StudentFaq({ initial, suggest, submit, list }: Props) {
  const t = useTranslations('faq');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);

  async function refresh() {
    try {
      const result = await list({});
      if (result.ok) {
        setItems(result.data.items);
        setCursor(result.data.nextCursor);
      }
    } catch {
      /* Liste bir sonraki açılışta yenilenir; gönderim zaten kaydedildi. */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-8 px-5 pb-12 pt-10 sm:pt-14">
      <div>
        <p className="font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{t('request.title')}</h1>
        <p className="mt-3 text-base text-fg-muted">{t('request.description')}</p>
      </div>
      <RequestForm suggest={suggest} submit={submit} onSubmitted={() => void refresh()} />
      <section aria-labelledby="mine-title" className="flex flex-col gap-3">
        <h2 id="mine-title" className="text-2xl font-semibold text-fg">
          {t('mine.title')}
        </h2>
        <MyRequests
          items={items}
          nextCursor={cursor}
          list={list}
          onMore={(page) => {
            setItems((old) => [...old, ...page.items]);
            setCursor(page.nextCursor);
          }}
        />
      </section>
    </div>
  );
}
