'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import type {
  ApplyCvInput,
  ApplyCvOutput,
  CvDecisionInput,
  CvIdInput,
  CvItemStatus,
  CvReview as CvReviewData,
  CvReviewItem,
  DiscardCvOutput,
} from '@/contracts/cv';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, Checkbox, EmptyState, Modal, Sheet } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { EntryEditor } from './entry-editor';
import { EntrySummary } from './entry-summary';

type Values = Record<string, unknown>;
type Decision = { kind: 'accept' | 'reject'; values?: Values; overwrite: boolean };

type Props = {
  review: CvReviewData;
  apply: (input: ApplyCvInput) => Promise<ActionResult<ApplyCvOutput>>;
  discard: (input: CvIdInput) => Promise<ActionResult<DiscardCvOutput>>;
  onApplied: (output: ApplyCvOutput) => void;
  onDiscarded: () => void;
};

const GROUPS: readonly CvItemStatus[] = ['NEW', 'CHANGED', 'CONFLICT'];
const GROUP_TONE = { NEW: 'success', CHANGED: 'info', CONFLICT: 'warning' } as const;

/**
 * CV onay ekranı: kalem kalem kabul / düzelt / reddet. Kararı olmayan kalem YAZILMAZ; çakışan kalem (kullanıcı
 * elle düzeltmiş) yalnız açık “üzerine yaz” seçimiyle kabul edilir. Sunucu aynı kuralları yeniden uygular.
 */
export function CvReview({ review, apply, discard, onApplied, onDiscarded }: Props) {
  const t = useTranslations('profile.cv.review');
  const sections = useTranslations('profile.sections');
  const fields = useTranslations('profile.fields');
  const errors = useTranslations('errors.codes');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [overwriteMissing, setOverwriteMissing] = useState<string>();
  const [editing, setEditing] = useState<CvReviewItem>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [noneSelected, setNoneSelected] = useState(false);
  const [pending, setPending] = useState<'apply' | 'discard'>();
  const locked = useRef(false);
  const editFormId = useId();

  const accepted = Object.entries(decisions).filter(([, decision]) => decision.kind === 'accept');

  function decide(key: string, decision: Decision | undefined) {
    setNoneSelected(false);
    setOverwriteMissing(undefined);
    setDecisions((current) => {
      const next = { ...current };
      if (decision) next[key] = decision;
      else delete next[key];
      return next;
    });
  }

  function accept(item: CvReviewItem) {
    if (item.status === 'CONFLICT' && !overwrite[item.key]) {
      setOverwriteMissing(item.key);
      return;
    }
    decide(item.key, { kind: 'accept', overwrite: item.status === 'CONFLICT' });
  }

  function acceptAllSafe() {
    setNoneSelected(false);
    setDecisions((current) => {
      const next = { ...current };
      for (const item of review.items) {
        if (item.status !== 'CONFLICT' && !next[item.key])
          next[item.key] = { kind: 'accept', overwrite: false };
      }
      return next;
    });
  }

  async function submit() {
    if (locked.current) return;
    if (accepted.length === 0) {
      setNoneSelected(true);
      return;
    }
    locked.current = true;
    setPending('apply');
    setError(undefined);
    try {
      const list = accepted.map(([key, decision]) => {
        const item = review.items.find((entry) => entry.key === key)!;
        return {
          key,
          section: item.section,
          overwriteMine: decision.overwrite,
          ...(decision.values ? { values: decision.values } : {}),
        } as CvDecisionInput;
      });
      const result = await apply({ cvUploadId: review.cvUploadId, decisions: list });
      if (result.ok) onApplied(result.data);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  async function confirmDiscard() {
    if (locked.current) return;
    locked.current = true;
    setPending('discard');
    setError(undefined);
    try {
      const result = await discard({ cvUploadId: review.cvUploadId });
      if (result.ok) onDiscarded();
      else {
        setError(result.errorCode);
        setDiscardOpen(false);
      }
    } catch {
      setError('SERVER_UNEXPECTED');
      setDiscardOpen(false);
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  const stateOf = (key: string): 'accept' | 'edited' | 'reject' | 'pending' => {
    const decision = decisions[key];
    if (!decision) return 'pending';
    if (decision.kind === 'reject') return 'reject';
    return decision.values ? 'edited' : 'accept';
  };

  if (review.items.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        description={
          review.unchangedCount > 0 ? t('unchanged', { count: review.unchangedCount }) : undefined
        }
        action={
          <Button variant="secondary" onClick={onDiscarded}>
            {t('cancel')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-fg">{t('title')}</h2>
        <p className="mt-2 text-base text-fg-muted">{t('description')}</p>
        {review.unchangedCount > 0 && (
          <p className="mt-1 text-sm text-fg-muted">
            {t('unchanged', { count: review.unchangedCount })}
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={acceptAllSafe}>
        {t('acceptAll')}
      </Button>

      {GROUPS.map((group) => {
        const items = review.items.filter((item) => item.status === group);
        if (items.length === 0) return null;
        return (
          <section
            key={group}
            aria-labelledby={`cv-group-${group}`}
            className="flex flex-col gap-3"
          >
            <h3 id={`cv-group-${group}`} className="text-xl font-semibold text-fg">
              {t(`groups.${group}`)}
              <span className="ml-2 text-base font-normal text-fg-muted">({items.length})</span>
            </h3>
            {group === 'CONFLICT' && <p className="text-base text-fg-muted">{t('conflictHint')}</p>}
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const state = stateOf(item.key);
                const decision = decisions[item.key];
                const shown = (decision?.values ?? item.proposed) as Values;
                return (
                  <li
                    key={item.key}
                    className={
                      'rounded-card border bg-bg p-4 shadow-card ' +
                      (group === 'CONFLICT' ? 'border-warning' : 'border-border')
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{sections(item.section)}</Badge>
                      <Badge tone={GROUP_TONE[item.status]}>{t(`groups.${item.status}`)}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-fg-muted">{t('proposed')}</p>
                    <EntrySummary section={item.section} value={shown} />
                    {item.standardized.skill ||
                    item.standardized.company ||
                    item.standardized.title ? (
                      <p className="mt-1 text-sm text-fg-muted">
                        {t('standardized', {
                          name: [
                            item.standardized.title,
                            item.standardized.company,
                            item.standardized.skill,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        })}
                      </p>
                    ) : null}
                    {item.current && (
                      <div className="mt-3 rounded-control bg-surface p-3">
                        <p className="text-sm font-medium text-fg-muted">{t('current')}</p>
                        <EntrySummary section={item.section} value={item.current as Values} />
                        {item.changedFields.length > 0 && (
                          <p className="mt-1 text-sm text-fg-muted">
                            {t('changedFields', {
                              fields: item.changedFields
                                .map((field) =>
                                  fields.has(field as 'headline')
                                    ? fields(field as 'headline')
                                    : sections(item.section),
                                )
                                .join(', '),
                            })}
                          </p>
                        )}
                      </div>
                    )}
                    {item.status === 'CONFLICT' && (
                      <div className="mt-3">
                        <Checkbox
                          label={t('overwrite')}
                          checked={Boolean(overwrite[item.key])}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setOverwrite((current) => ({ ...current, [item.key]: checked }));
                            // İzin geri alınırsa daha önce kabul edilen çakışma da tekrar karar bekler.
                            if (!checked) decide(item.key, undefined);
                            setOverwriteMissing(undefined);
                          }}
                        />
                        {overwriteMissing === item.key && (
                          <p role="alert" className="text-sm text-danger">
                            {t('overwriteNeeded')}
                          </p>
                        )}
                      </div>
                    )}
                    <p
                      role="status"
                      className={
                        'mt-3 text-sm font-semibold ' +
                        (state === 'reject'
                          ? 'text-danger'
                          : state === 'pending'
                            ? 'text-fg-muted'
                            : 'text-on-success-soft')
                      }
                    >
                      {t(`state.${state}`)}
                    </p>
                    {state === 'pending' ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Button onClick={() => accept(item)}>{t('accept')}</Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (item.status === 'CONFLICT' && !overwrite[item.key]) {
                              setOverwriteMissing(item.key);
                              return;
                            }
                            setEditing(item);
                          }}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => decide(item.key, { kind: 'reject', overwrite: false })}
                        >
                          {t('reject')}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <Button variant="ghost" onClick={() => decide(item.key, undefined)}>
                          {t('undo')}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <Button variant="ghost" fullWidth onClick={() => setDiscardOpen(true)}>
        {t('discard')}
      </Button>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 bg-bg pt-3 pb-2 lg:static">
        {error && (
          <div role="alert" className="text-base text-danger">
            <p>{errors(error)}</p>
            {error === 'CV_REVIEW_STALE' && (
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {t('refresh')}
              </Button>
            )}
          </div>
        )}
        {noneSelected && (
          <p role="alert" className="text-base text-danger">
            {t('noneSelected')}
          </p>
        )}
        <Button size="lg" fullWidth loading={pending === 'apply'} onClick={() => void submit()}>
          {pending === 'apply' ? t('applying') : `${t('apply')} (${accepted.length})`}
        </Button>
      </div>

      <Sheet
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={t('edit')}
        footer={
          <>
            <Button type="submit" form={editFormId} size="lg" fullWidth>
              {t('accept')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setEditing(undefined)}>
              {t('cancel')}
            </Button>
          </>
        }
        description={editing ? sections(editing.section) : undefined}
      >
        {editing && (
          <EntryEditor
            formId={editFormId}
            externalActions
            key={editing.key}
            section={editing.section}
            initial={(decisions[editing.key]?.values ?? editing.proposed) as Values}
            submitLabel={t('accept')}
            cancelLabel={t('cancel')}
            onCancel={() => setEditing(undefined)}
            onSubmit={(values) => {
              decide(editing.key, {
                kind: 'accept',
                values,
                overwrite: editing.status === 'CONFLICT',
              });
              setEditing(undefined);
            }}
          />
        )}
      </Sheet>

      <Modal
        open={discardOpen}
        onClose={() => pending !== 'discard' && setDiscardOpen(false)}
        title={t('discardTitle')}
        description={t('discardDescription')}
        footer={
          <>
            <Button
              variant="danger"
              fullWidth
              loading={pending === 'discard'}
              onClick={() => void confirmDiscard()}
            >
              {t('discardConfirm')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setDiscardOpen(false)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
