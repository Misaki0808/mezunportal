'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AUDIT_ACTION_NAMES,
  AUDIT_TARGET_TYPE_NAMES,
  listAuditLogSchema,
  type AuditLogPage,
  type ListAuditLogInput,
} from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Select } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';
type Props = {
  initial: AuditLogPage;
  list: (input: ListAuditLogInput) => Promise<ActionResult<AuditLogPage>>;
};
export function AuditLog({ initial, list }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [applied, setApplied] = useState<ListAuditLogInput>({});
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [targetId, setTargetId] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  async function load(next: Record<string, unknown>, after?: string) {
    if (pending) return;
    const parsed = listAuditLogSchema.safeParse({ ...next, ...(after ? { cursor: after } : {}) });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setInvalid(false);
    setError(undefined);
    try {
      const result = await list(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => (after ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
      if (!after) setApplied(parsed.data);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  return (
    <AdminFrame title={t('audit.title')}>
      <form
        className="grid gap-4 rounded-card border border-border p-5 md:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load({
            ...(action ? { action } : {}),
            ...(target ? { targetType: target } : {}),
            ...(targetId ? { targetId } : {}),
            ...(actorId ? { actorId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          });
        }}
      >
        <Field label={t('audit.action')}>
          {(props) => (
            <Select {...props} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">{t('all')}</option>
              {AUDIT_ACTION_NAMES.map((v) => (
                <option key={v} value={v}>
                  {t(`audit.actions.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('audit.target')}>
          {(props) => (
            <Select {...props} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('all')}</option>
              {AUDIT_TARGET_TYPE_NAMES.map((v) => (
                <option key={v} value={v}>
                  {t(`audit.targets.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('audit.targetId')}>
          {(props) => (
            <Input
              {...props}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              maxLength={64}
            />
          )}
        </Field>
        <Field label={t('audit.actorId')}>
          {(props) => (
            <Input
              {...props}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              maxLength={64}
            />
          )}
        </Field>
        <Field label={t('audit.from')}>
          {(props) => (
            <Input {...props} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          )}
        </Field>
        <Field label={t('audit.to')}>
          {(props) => (
            <Input {...props} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          )}
        </Field>
        {invalid && (
          <p role="alert" className="text-danger md:col-span-2 lg:col-span-3">
            {t('invalid')}
          </p>
        )}
        <div className="md:col-span-2 lg:col-span-3">
          <Button type="submit" loading={pending}>
            {t('search')}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-6" aria-busy={pending}>
        {items.length === 0 ? (
          <EmptyState title={t('empty')} description={t('emptyDescription')} />
        ) : (
          <ResponsiveRows
            headers={[
              t('audit.actor'),
              t('audit.action'),
              t('audit.target'),
              t('reason'),
              t('created'),
            ]}
            rows={items.map((entry) => ({
              id: entry.id,
              cells: [
                entry.actorName,
                t.has(`audit.actions.${entry.action as (typeof AUDIT_ACTION_NAMES)[number]}`)
                  ? t(`audit.actions.${entry.action as (typeof AUDIT_ACTION_NAMES)[number]}`)
                  : t('none'),
                <span key="target">
                  {t.has(
                    `audit.targets.${entry.targetType as (typeof AUDIT_TARGET_TYPE_NAMES)[number]}`,
                  )
                    ? t(
                        `audit.targets.${entry.targetType as (typeof AUDIT_TARGET_TYPE_NAMES)[number]}`,
                      )
                    : t('none')}{' '}
                  · {entry.targetId}
                </span>,
                entry.reason ?? t('none'),
                new Intl.DateTimeFormat('tr-TR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(entry.createdAt)),
              ],
            }))}
          />
        )}
      </div>
      {cursor && (
        <Button
          className="mt-5"
          variant="secondary"
          loading={pending}
          onClick={() => void load(applied, cursor)}
        >
          {t('more')}
        </Button>
      )}
    </AdminFrame>
  );
}
