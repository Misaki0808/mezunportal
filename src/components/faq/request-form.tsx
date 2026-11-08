'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  FAQ_PAGE_HREF,
  FAQ_QUESTION_MAX,
  FAQ_QUESTION_MIN,
  submitFaqRequestSchema,
  type FaqSuggestion,
  type SubmitFaqRequestInput,
  type SubmitFaqRequestOutput,
  type SuggestSimilarFaqsInput,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';
import { Button, Checkbox, Field, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

/** Yazmayı bölmemek için öneri isteği yazma durunca (gecikmeli) gider. */
export const SUGGEST_DELAY_MS = 800;

type Props = {
  suggest: (input: SuggestSimilarFaqsInput) => Promise<ActionResult<FaqSuggestion[]>>;
  submit: (input: SubmitFaqRequestInput) => Promise<ActionResult<SubmitFaqRequestOutput>>;
  /** Gönderim başarılı olunca (liste yenilenir). */
  onSubmitted: () => void;
};

export function RequestForm({ suggest, submit, onSubmitted }: Props) {
  const t = useTranslations('faq.request');
  const errors = useTranslations('errors.codes');
  const [question, setQuestion] = useState('');
  const [suggestions, setSuggestions] = useState<FaqSuggestion[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [sent, setSent] = useState(false);
  const ticket = useRef(0);
  const trimmed = question.trim();

  // Gecikmeli benzer SSS önerisi; eski yanıt yenisini ezmez.
  useEffect(() => {
    const mine = ++ticket.current;
    if (trimmed.length < FAQ_QUESTION_MIN) return;
    const timer = setTimeout(() => {
      suggest({ text: trimmed })
        .then((result) => {
          if (mine === ticket.current && result.ok) setSuggestions(result.data);
        })
        .catch(() => undefined);
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trimmed, suggest]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = submitFaqRequestSchema.safeParse({
      question,
      similarAcknowledged: acknowledged,
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setError(undefined);
    setSent(false);
    setPending(true);
    try {
      const result = await submit(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setQuestion('');
      setSuggestions([]);
      setAcknowledged(false);
      setSent(true);
      onSubmitted();
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  // Soru kısalınca eski öneriler gösterilmez (effect içinde eşzamanlı setState yok).
  const visible = trimmed.length >= FAQ_QUESTION_MIN ? suggestions : [];
  const similarBlocked = error === 'FAQ_SIMILAR_EXISTS';
  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      <Field
        label={t('label')}
        hint={t('hint', { min: FAQ_QUESTION_MIN, max: FAQ_QUESTION_MAX })}
        required
        error={invalid ? t('invalid', { min: FAQ_QUESTION_MIN, max: FAQ_QUESTION_MAX }) : undefined}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={4}
            maxLength={FAQ_QUESTION_MAX}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setAcknowledged(false);
              setSent(false);
              if (error === 'FAQ_SIMILAR_EXISTS') setError(undefined);
            }}
          />
        )}
      </Field>
      <p className="text-sm text-fg-muted">
        {t('counter', { count: question.length, max: FAQ_QUESTION_MAX })}
      </p>
      {visible.length > 0 && (
        <section
          aria-labelledby="similar-title"
          className="rounded-card border border-border bg-surface-subtle p-4"
        >
          <h3 id="similar-title" className="text-base font-semibold text-fg">
            {t('similarTitle')}
          </h3>
          <p className="mt-1 text-sm text-fg-muted">{t('similarDescription')}</p>
          <ul className="mt-3 flex flex-col gap-1">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${FAQ_PAGE_HREF}/${item.id}`}
                  className="press-row flex min-h-11 items-center font-medium text-primary [overflow-wrap:anywhere]"
                >
                  {item.question}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {similarBlocked && (
        <Checkbox
          label={t('acknowledge')}
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
      )}
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {sent && (
        <p role="status" className="text-on-success-soft">
          {t('sent')}
        </p>
      )}
      {similarBlocked && !acknowledged ? (
        <Button type="submit" disabled disabledReason={t('acknowledgeFirst')}>
          {t('submit')}
        </Button>
      ) : (
        <Button type="submit" loading={pending}>
          {t('submit')}
        </Button>
      )}
    </form>
  );
}
