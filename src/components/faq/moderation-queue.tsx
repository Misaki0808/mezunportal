'use client';
import { useQueueFocus } from '@/components/admin/use-queue-focus';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { adminReason } from '@/contracts/admin';
import {
  FAQ_ANSWER_MAX,
  FAQ_QUESTION_MAX,
  publishFaqSchema,
  type DecideFaqOutput,
  type FaqModerationItem,
  type FaqModerationPage,
  type ListFaqModerationQueueInput,
  type PublishFaqInput,
  type PublishFaqOutput,
  type RedirectFaqInput,
  type RejectFaqInput,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Modal, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { formatDate } from './format';

export type ModerationActions = {
  list: (input: ListFaqModerationQueueInput) => Promise<ActionResult<FaqModerationPage>>;
  publish: (input: PublishFaqInput) => Promise<ActionResult<PublishFaqOutput>>;
  reject: (input: RejectFaqInput) => Promise<ActionResult<DecideFaqOutput>>;
  redirect: (input: RedirectFaqInput) => Promise<ActionResult<DecideFaqOutput>>;
};

type Kind = 'PUBLISH' | 'REJECT' | 'REDIRECT';

function ModerationCard({
  item,
  actions,
  onDone,
}: {
  item: FaqModerationItem;
  actions: ModerationActions;
  onDone: (id: string, kind: Kind) => void;
}) {
  const t = useTranslations('faq.moderation');
  const errors = useTranslations('errors.codes');
  const groupId = useId();
  const [selected, setSelected] = useState<string | undefined>(item.answers[0]?.id);
  const [question, setQuestion] = useState(item.question);
  const [answer, setAnswer] = useState(item.answers[0]?.body ?? '');
  const [kind, setKind] = useState<Kind>();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  function choose(id: string) {
    setSelected(id);
    setAnswer(item.answers.find((a) => a.id === id)?.body ?? '');
  }
  function open(next: Kind) {
    setKind(next);
    setNote('');
    setInvalid(false);
    setError(undefined);
  }
  function close() {
    if (!pending) setKind(undefined);
  }

  async function confirm() {
    if (!kind || pending) return;
    let call: Promise<ActionResult<unknown>>;
    if (kind === 'PUBLISH') {
      const parsed = publishFaqSchema.safeParse({
        requestId: item.id,
        selectedAnswerId: selected,
        question,
        answer,
      });
      if (!parsed.success) {
        setInvalid(true);
        return;
      }
      call = actions.publish(parsed.data);
    } else {
      if (!adminReason.safeParse(note).success) {
        setInvalid(true);
        return;
      }
      call =
        kind === 'REJECT'
          ? actions.reject({ requestId: item.id, reason: note.trim() })
          : actions.redirect({ requestId: item.id, note: note.trim() });
    }
    setInvalid(false);
    setError(undefined);
    setPending(true);
    try {
      const result = await call;
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setKind(undefined);
      onDone(item.id, kind);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  const noAnswers = item.answers.length === 0;
  return (
    <li data-queue-row={item.id} className="min-w-0 rounded-card border border-border p-4 sm:p-5">
      <p className="text-sm text-fg-muted">{formatDate(item.createdAt)}</p>
      <div className="mt-3 flex flex-col gap-4">
        <Field
          label={t('question')}
          hint={t('identityWarning')}
          error={invalid && question.trim().length === 0 ? t('invalid') : undefined}
        >
          {(f) => (
            <Textarea
              {...f}
              rows={3}
              maxLength={FAQ_QUESTION_MAX}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="min-w-0">
          <legend className="text-base font-medium text-fg">{t('answers')}</legend>
          {noAnswers ? (
            <p className="mt-2 text-base text-fg-muted">{t('noAnswers')}</p>
          ) : (
            <ul className="mt-2 grid gap-3 md:grid-cols-2">
              {item.answers.map((a, index) => (
                <li key={a.id} className="min-w-0">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-surface">
                    <input
                      type="radio"
                      name={groupId}
                      value={a.id}
                      checked={selected === a.id}
                      onChange={() => choose(a.id)}
                      className="mt-1 size-5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg-muted">
                        {t('answerN', { n: index + 1 })}
                      </span>
                      <span className="mt-1 block whitespace-pre-line text-base text-fg [overflow-wrap:anywhere]">
                        {a.body}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {!noAnswers && (
          <Field
            label={t('publishedAnswer')}
            hint={t('identityWarning')}
            error={invalid && answer.trim().length === 0 ? t('invalid') : undefined}
          >
            {(f) => (
              <Textarea
                {...f}
                rows={5}
                maxLength={FAQ_ANSWER_MAX}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}
          </Field>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {noAnswers ? (
            <Button disabled disabledReason={t('needsAnswer')}>
              {t('publish')}
            </Button>
          ) : (
            <Button data-queue-action onClick={() => open('PUBLISH')}>
              {t('publish')}
            </Button>
          )}
          <Button data-queue-action variant="secondary" onClick={() => open('REDIRECT')}>
            {t('redirect')}
          </Button>
          <Button
            variant="secondary"
            className="border-danger text-danger"
            onClick={() => open('REJECT')}
          >
            {t('reject')}
          </Button>
        </div>
      </div>
      <Modal
        open={kind !== undefined}
        onClose={close}
        title={kind ? t(`dialog.${kind}.title`) : ''}
        description={kind ? t(`dialog.${kind}.description`) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant={kind === 'REJECT' ? 'secondary' : 'primary'}
              className={kind === 'REJECT' ? 'border-danger text-danger' : undefined}
              loading={pending}
              onClick={() => void confirm()}
            >
              {kind ? t(`dialog.${kind}.confirm`) : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {kind === 'PUBLISH' ? (
            <p className="text-base text-fg-muted [overflow-wrap:anywhere]">{question}</p>
          ) : (
            kind && (
              <Field
                label={t(`dialog.${kind}.noteLabel`)}
                hint={t('noteHint')}
                required
                error={invalid ? t('noteInvalid') : undefined}
              >
                {(f) => <Textarea {...f} value={note} onChange={(e) => setNote(e.target.value)} />}
              </Field>
            )
          )}
          {invalid && kind === 'PUBLISH' && (
            <p role="alert" className="text-danger">
              {t('invalid')}
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {errors(error)}
            </p>
          )}
        </div>
      </Modal>
    </li>
  );
}

/** Moderatör kuyruğu: kimliksiz cevapları karşılaştır, en iyisini seç, metni düzenle; yayımla / reddet / yönlendir. */
export function FaqModerationQueue({
  initial,
  actions,
}: {
  initial: FaqModerationPage;
  actions: ModerationActions;
}) {
  const t = useTranslations('faq.moderation');
  const errors = useTranslations('errors.codes');
  const queueFocus = useQueueFocus();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [notice, setNotice] = useState<Kind>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  async function more() {
    if (!cursor || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await actions.list({ cursor });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => [...old, ...result.data.items]);
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={queueFocus.rootRef} className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="text-on-success-soft">
          {t(`done.${notice}`)}
        </p>
      )}
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
            <ModerationCard
              key={item.id}
              item={item}
              actions={actions}
              onDone={(id, kind) => {
                queueFocus.complete(id);
                setItems((old) => old.filter((row) => row.id !== id));
                setNotice(kind);
              }}
            />
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void more()}>
          {t('more')}
        </Button>
      )}
    </div>
  );
}
