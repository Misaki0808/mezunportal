'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import {
  answerFaqRequestSchema,
  FAQ_ANSWER_MAX,
  FAQ_ANSWER_MIN,
  type AnswerFaqRequestInput,
  type AnswerFaqRequestOutput,
  type ListFaqRequestsForMentorInput,
  type MentorFaqRequestPage,
  type MentorFaqRequestView,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, EmptyState, Field, PageHeader, Switch, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { formatDate } from './format';

type Props = {
  initial: MentorFaqRequestPage;
  list: (input: ListFaqRequestsForMentorInput) => Promise<ActionResult<MentorFaqRequestPage>>;
  answer: (input: AnswerFaqRequestInput) => Promise<ActionResult<AnswerFaqRequestOutput>>;
};

function AnswerCard({
  item,
  answer,
  onSaved,
}: {
  item: MentorFaqRequestView;
  answer: Props['answer'];
  onSaved: (body: string) => void;
}) {
  const t = useTranslations('faq.mentor');
  const errors = useTranslations('errors.codes');
  const [body, setBody] = useState(item.myAnswer?.body ?? '');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const answerRef = useRef<HTMLTextAreaElement>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = answerFaqRequestSchema.safeParse({ requestId: item.id, body });
    if (!parsed.success) {
      setInvalid(true);
      answerRef.current?.focus();
      return;
    }
    setInvalid(false);
    setError(undefined);
    setSaved(false);
    setPending(true);
    try {
      const result = await answer(parsed.data);
      if (!result.ok) {
        if (result.fieldErrors?.body) {
          setInvalid(true);
          answerRef.current?.focus();
        } else setError(result.errorCode);
        return;
      }
      setSaved(true);
      onSaved(parsed.data.body);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={item.myAnswer ? 'success' : 'warning'}>
          {item.myAnswer ? t('answered') : t('unanswered')}
        </Badge>
        <span className="text-sm text-fg-muted">{formatDate(item.createdAt)}</span>
      </div>
      <p id={titleId} className="mt-2 text-lg font-semibold text-fg [overflow-wrap:anywhere]">
        {item.question}
      </p>
      <form onSubmit={(e) => void save(e)} noValidate className="mt-3 flex flex-col gap-3">
        <Field
          label={t('answerLabel')}
          hint={t('answerHint', { min: FAQ_ANSWER_MIN, max: FAQ_ANSWER_MAX })}
          error={
            invalid ? t('answerInvalid', { min: FAQ_ANSWER_MIN, max: FAQ_ANSWER_MAX }) : undefined
          }
        >
          {(field) => (
            <Textarea
              {...field}
              ref={answerRef}
              rows={5}
              aria-describedby={`${field['aria-describedby'] ?? ''} ${titleId}`.trim()}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setInvalid(false);
                setSaved(false);
              }}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-danger">
            {errors(error)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-on-success-soft">
            {t('saved')}
          </p>
        )}
        <Button type="submit" loading={pending}>
          {item.myAnswer ? t('update') : t('send')}
        </Button>
      </form>
    </li>
  );
}

/** Mentor: kendine düşen açık talepler + cevap formu. Soran kimliği sözleşmede yoktur; ekran da göstermez. */
export function MentorRequests({ initial, list, answer }: Props) {
  const t = useTranslations('faq.mentor');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  async function load(only: boolean, from?: string) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ onlyUnanswered: only, ...(from ? { cursor: from } : {}) });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => (from ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-5">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <Switch
        label={t('onlyUnanswered')}
        checked={onlyUnanswered}
        disabled={pending}
        onChange={(e) => {
          setOnlyUnanswered(e.target.checked);
          void load(e.target.checked);
        }}
      />
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <AnswerCard
              key={item.id}
              item={item}
              answer={answer}
              onSaved={(body) =>
                setItems((old) =>
                  onlyUnanswered
                    ? old.filter((row) => row.id !== item.id)
                    : old.map((row) =>
                        row.id === item.id
                          ? {
                              ...row,
                              myAnswer: {
                                id: row.myAnswer?.id ?? 'saved',
                                body,
                                updatedAt: new Date(),
                              },
                            }
                          : row,
                      ),
                )
              }
            />
          ))}
        </ul>
      )}
      {cursor && (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => void load(onlyUnanswered, cursor)}
        >
          {t('more')}
        </Button>
      )}
    </div>
  );
}
