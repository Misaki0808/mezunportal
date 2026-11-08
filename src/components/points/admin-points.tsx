'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AdminFrame } from '@/components/admin/frame';
import { ResponsiveRows } from '@/components/admin/responsive-rows';
import {
  POINT_RULE_DELAY_MAX_DAYS,
  POINT_RULE_POINTS_MAX,
  POINT_STATUSES,
  SUSPICION_STATUSES,
  updatePointRuleSchema,
  type DecideSuspicionInput,
  type DecideSuspicionOutput,
  type ListPointEntriesInput,
  type ListSuspicionFlagsInput,
  type PointEntryPage,
  type PointRuleView,
  type RequestPointBackfillInput,
  type RequestPointBackfillOutput,
  type RevokePointEntryInput,
  type RevokePointEntryOutput,
  type SuspicionDecision,
  type SuspicionFlagPage,
  type SuspicionFlagView,
  type UpdatePointRuleInput,
} from '@/contracts/points';
import type { ActionResult } from '@/contracts/result';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  Switch,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { PointEntryRow } from './entry-row';
import { formatDate, formatDateTime } from './format';
import { ReasonModal } from './reason-modal';

export type AdminPointsActions = {
  updateRule: (input: UpdatePointRuleInput) => Promise<ActionResult<PointRuleView>>;
  listEntries: (input: ListPointEntriesInput) => Promise<ActionResult<PointEntryPage>>;
  revokeEntry: (input: RevokePointEntryInput) => Promise<ActionResult<RevokePointEntryOutput>>;
  listFlags: (input: ListSuspicionFlagsInput) => Promise<ActionResult<SuspicionFlagPage>>;
  decide: (input: DecideSuspicionInput) => Promise<ActionResult<DecideSuspicionOutput>>;
  backfill: (input: RequestPointBackfillInput) => Promise<ActionResult<RequestPointBackfillOutput>>;
};

type Props = {
  rules: PointRuleView[];
  flags: SuspicionFlagPage;
  actions: AdminPointsActions;
};

export function AdminPoints({ rules, flags, actions }: Props) {
  const t = useTranslations('points.admin');
  return (
    <AdminFrame title={t('title')} description={t('description')}>
      <Tabs
        label={t('tabsLabel')}
        items={[
          {
            id: 'rules',
            label: t('tabs.rules'),
            content: <RulesPanel initial={rules} actions={actions} />,
          },
          {
            id: 'flags',
            label: t('tabs.flags'),
            content: <FlagsPanel initial={flags} actions={actions} />,
          },
          { id: 'entries', label: t('tabs.entries'), content: <EntriesPanel actions={actions} /> },
          {
            id: 'backfill',
            label: t('tabs.backfill'),
            content: <BackfillPanel actions={actions} />,
          },
        ]}
      />
    </AdminFrame>
  );
}

// ---------------------------------------------------------------------------------------------

function RulesPanel({
  initial,
  actions,
}: {
  initial: PointRuleView[];
  actions: AdminPointsActions;
}) {
  const t = useTranslations('points');
  const [rules, setRules] = useState(initial);
  const [editing, setEditing] = useState<PointRuleView>();
  const [points, setPoints] = useState('');
  const [delay, setDelay] = useState('');
  const [active, setActive] = useState(true);
  const [notice, setNotice] = useState(false);

  function start(rule: PointRuleView) {
    setEditing(rule);
    setPoints(String(rule.points));
    setDelay(String(rule.delayDays));
    setActive(rule.isActive);
    setNotice(false);
  }
  const numbers = {
    points: points.trim() === '' ? NaN : Number(points),
    delayDays: delay.trim() === '' ? NaN : Number(delay),
  };
  const fieldsValid = updatePointRuleSchema.safeParse({
    action: editing?.action,
    ...numbers,
    isActive: active,
    reason: 'geçerli gerekçe',
  }).success;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-fg-muted">{t('admin.rulesHint')}</p>
      {notice && (
        <p role="status" className="text-on-success-soft">
          {t('admin.ruleSaved')}
        </p>
      )}
      <ResponsiveRows
        headers={[
          t('admin.action'),
          t('admin.rulePoints'),
          t('admin.ruleDelay'),
          t('admin.ruleActive'),
          t('admin.actions'),
        ]}
        rows={rules.map((rule) => ({
          id: rule.action,
          cells: [
            t(`actions.${rule.action}`),
            String(rule.points),
            t('admin.days', { count: rule.delayDays }),
            <Badge key="a" tone={rule.isActive ? 'success' : 'neutral'}>
              {rule.isActive ? t('admin.active') : t('admin.inactive')}
            </Badge>,
            <Button key="e" variant="secondary" onClick={() => start(rule)}>
              {t('admin.edit')}
            </Button>,
          ],
        }))}
      />
      <ReasonModal
        open={editing !== undefined}
        title={editing ? t('admin.editRule', { action: t(`actions.${editing.action}`) }) : ''}
        description={t('admin.ruleFutureOnly')}
        confirmLabel={t('admin.saveRule')}
        blocked={!fieldsValid}
        onClose={() => setEditing(undefined)}
        onSubmit={async (reason) => {
          if (!editing) return undefined;
          const result = await actions.updateRule({
            action: editing.action,
            points: numbers.points,
            delayDays: numbers.delayDays,
            isActive: active,
            reason,
          });
          if (!result.ok) return result.errorCode;
          setRules((old) => old.map((r) => (r.action === result.data.action ? result.data : r)));
          setNotice(true);
          return undefined;
        }}
      >
        <Field
          label={t('admin.rulePoints')}
          hint={t('admin.rangeHint', { max: POINT_RULE_POINTS_MAX })}
          required
        >
          {(f) => (
            <Input
              {...f}
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('admin.ruleDelay')}
          hint={t('admin.rangeHint', { max: POINT_RULE_DELAY_MAX_DAYS })}
          required
        >
          {(f) => (
            <Input
              {...f}
              inputMode="numeric"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
            />
          )}
        </Field>
        <Switch
          label={t('admin.ruleActive')}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </ReasonModal>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const FLAG_TONE: Record<SuspicionFlagView['status'], BadgeTone> = {
  OPEN: 'warning',
  CONFIRMED: 'danger',
  DISMISSED: 'neutral',
};

function FlagsPanel({
  initial,
  actions,
}: {
  initial: SuspicionFlagPage;
  actions: AdminPointsActions;
}) {
  const t = useTranslations('points');
  const errors = useTranslations('errors.codes');
  const [status, setStatus] = useState<SuspicionFlagView['status']>('OPEN');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [target, setTarget] = useState<{ flag: SuspicionFlagView; decision: SuspicionDecision }>();
  const [notice, setNotice] = useState<number>();

  async function load(next: SuspicionFlagView['status'], from?: string) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await actions.listFlags({ status: next, ...(from ? { cursor: from } : {}) });
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
    <div className="flex flex-col gap-4">
      <p className="text-base text-fg-muted">{t('admin.flagsHint')}</p>
      <Field label={t('admin.flagStatus')}>
        {(f) => (
          <Select
            {...f}
            value={status}
            onChange={(e) => {
              const next = e.target.value as SuspicionFlagView['status'];
              setStatus(next);
              setNotice(undefined);
              void load(next);
            }}
          >
            {SUSPICION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.flagStatuses.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {notice !== undefined && (
        <p role="status" className="text-on-success-soft">
          {t('admin.decided', { count: notice })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t('admin.flagsEmpty')} description={t('admin.flagsEmptyDescription')} />
      ) : (
        <ResponsiveRows
          headers={[
            t('admin.user'),
            t('admin.rule'),
            t('admin.details'),
            t('admin.flagStatus'),
            t('admin.actions'),
          ]}
          rows={items.map((flag) => ({
            id: flag.id,
            cells: [
              flag.displayName,
              t(`admin.rules.${flag.rule}`),
              <ul key="d" className="flex flex-col gap-1 text-sm">
                <li>
                  {formatDateTime(flag.details.windowStart)} –{' '}
                  {formatDateTime(flag.details.windowEnd)}
                </li>
                <li>
                  {t('admin.detailCounts', {
                    entries: flag.details.entryCount,
                    points: flag.details.points,
                  })}
                </li>
                {flag.details.sharePercent !== null && (
                  <li>{t('admin.detailShare', { percent: flag.details.sharePercent })}</li>
                )}
                {flag.details.syncedCount !== null && (
                  <li>{t('admin.detailSynced', { count: flag.details.syncedCount })}</li>
                )}
              </ul>,
              <Badge key="s" tone={FLAG_TONE[flag.status]}>
                {t(`admin.flagStatuses.${flag.status}`)}
              </Badge>,
              flag.status === 'OPEN' ? (
                <div key="a" className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="border-danger text-danger"
                    onClick={() => setTarget({ flag, decision: 'CONFIRM' })}
                  >
                    {t('admin.confirmFlag')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setTarget({ flag, decision: 'DISMISS' })}
                  >
                    {t('admin.dismissFlag')}
                  </Button>
                </div>
              ) : (
                flag.decidedAt && formatDate(flag.decidedAt)
              ),
            ],
          }))}
        />
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void load(status, cursor)}>
          {t('admin.more')}
        </Button>
      )}
      <ReasonModal
        open={target !== undefined}
        title={target ? t(`admin.decideTitle.${target.decision}`) : ''}
        description={target ? t(`admin.decideDescription.${target.decision}`) : undefined}
        confirmLabel={target ? t(`admin.decideConfirm.${target.decision}`) : ''}
        danger={target?.decision === 'CONFIRM'}
        onClose={() => setTarget(undefined)}
        onSubmit={async (reason) => {
          if (!target) return undefined;
          const result = await actions.decide({
            flagId: target.flag.id,
            decision: target.decision,
            reason,
          });
          if (!result.ok) return result.errorCode;
          setItems((old) => old.filter((f) => f.id !== target.flag.id));
          setNotice(result.data.revokedCount);
          return undefined;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function EntriesPanel({ actions }: { actions: AdminPointsActions }) {
  const t = useTranslations('points');
  const errors = useTranslations('errors.codes');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<PointEntryPage['items']>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [target, setTarget] = useState<PointEntryPage['items'][number]>();
  const [notice, setNotice] = useState(false);

  async function load(from?: string) {
    if (pending) return;
    if (!userId.trim()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPending(true);
    setError(undefined);
    try {
      const result = await actions.listEntries({
        userId: userId.trim(),
        ...(status ? { status: status as (typeof POINT_STATUSES)[number] } : {}),
        ...(from ? { cursor: from } : {}),
      });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => (from && old ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-fg-muted">{t('admin.entriesHint')}</p>
      <form
        className="flex flex-col gap-4 sm:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(false);
          void load();
        }}
      >
        <Field
          label={t('admin.userId')}
          hint={t('admin.userIdHint')}
          required
          error={invalid ? t('admin.userIdInvalid') : undefined}
        >
          {(f) => <Input {...f} value={userId} onChange={(e) => setUserId(e.target.value)} />}
        </Field>
        <Field label={t('admin.entryStatus')}>
          {(f) => (
            <Select {...f} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('admin.allStatuses')}</option>
              {POINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={pending}>
          {t('admin.list')}
        </Button>
      </form>
      {notice && (
        <p role="status" className="text-on-success-soft">
          {t('admin.revoked')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {items &&
        (items.length === 0 ? (
          <EmptyState title={t('admin.entriesEmpty')} description={t('empty')} />
        ) : (
          <ResponsiveRows
            headers={[t('admin.entry'), t('admin.actions')]}
            rows={items.map((entry) => ({
              id: entry.id,
              cells: [
                <PointEntryRow key="e" entry={entry} />,
                entry.status === 'REVOKED' ? (
                  t('status.REVOKED')
                ) : (
                  <Button
                    key="r"
                    variant="secondary"
                    className="border-danger text-danger"
                    onClick={() => setTarget(entry)}
                  >
                    {entry.status === 'PENDING' ? t('admin.cancelEntry') : t('admin.revokeEntry')}
                  </Button>
                ),
              ],
            }))}
          />
        ))}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void load(cursor)}>
          {t('admin.more')}
        </Button>
      )}
      <ReasonModal
        open={target !== undefined}
        title={target?.status === 'PENDING' ? t('admin.cancelEntry') : t('admin.revokeEntry')}
        description={t('admin.revokeDescription')}
        confirmLabel={
          target?.status === 'PENDING' ? t('admin.cancelEntry') : t('admin.revokeEntry')
        }
        danger
        onClose={() => setTarget(undefined)}
        onSubmit={async (reason) => {
          if (!target) return undefined;
          const result = await actions.revokeEntry({ entryId: target.id, reason });
          if (!result.ok) return result.errorCode;
          setItems((old) =>
            old?.map((e) =>
              e.id === target.id ? { ...e, status: 'REVOKED', revokedReason: 'ADMIN_CANCEL' } : e,
            ),
          );
          setNotice(true);
          return undefined;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function BackfillPanel({ actions }: { actions: AdminPointsActions }) {
  const t = useTranslations('points.admin');
  const [open, setOpen] = useState(false);
  const [queued, setQueued] = useState(false);
  return (
    <div className="flex flex-col gap-4 sm:max-w-xl">
      <p className="text-base text-fg-muted">{t('backfillHint')}</p>
      {queued && (
        <p role="status" className="text-on-success-soft">
          {t('backfillQueued')}
        </p>
      )}
      {queued ? (
        <Button disabled disabledReason={t('backfillLocked')}>
          {t('backfillStart')}
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>{t('backfillStart')}</Button>
      )}
      <ReasonModal
        open={open}
        noReason
        title={t('backfillTitle')}
        description={t('backfillConfirm')}
        confirmLabel={t('backfillStart')}
        onClose={() => setOpen(false)}
        onSubmit={async () => {
          const result = await actions.backfill({});
          if (!result.ok) return result.errorCode;
          setQueued(true);
          return undefined;
        }}
      />
    </div>
  );
}
