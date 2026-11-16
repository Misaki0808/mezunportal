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
import { AccountFrameView } from '@/components/account/account-frame';

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
  const frame = useTranslations('accountFrame');
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
    <AccountFrameView
      eyebrow={frame('eyebrow')}
      backLabel={frame('back')}
      title={t('request.title')}
      description={t('request.description')}
      width="max-w-3xl"
    >
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
    </AccountFrameView>
  );
}
