'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DICTIONARY_KINDS,
  createDictionaryEntrySchema,
  updateDictionaryEntrySchema,
  deleteDictionaryEntrySchema,
  type DictionaryKind,
  type DictionaryEntryPage,
  type DictionaryEntryIdOutput,
  type ListDictionaryEntriesInput,
  type CreateDictionaryEntryInput,
  type UpdateDictionaryEntryInput,
  type DeleteDictionaryEntryInput,
} from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';

type Entry = DictionaryEntryPage['items'][number];
type Props = {
  initial: DictionaryEntryPage;
  sectors: Entry[];
  list: (input: ListDictionaryEntriesInput) => Promise<ActionResult<DictionaryEntryPage>>;
  create: (input: CreateDictionaryEntryInput) => Promise<ActionResult<DictionaryEntryIdOutput>>;
  update: (input: UpdateDictionaryEntryInput) => Promise<ActionResult<DictionaryEntryIdOutput>>;
  remove: (input: DeleteDictionaryEntryInput) => Promise<ActionResult<DictionaryEntryIdOutput>>;
};
export function Dictionaries({ initial, sectors, list, create, update, remove }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [kind, setKind] = useState<DictionaryKind>('COMPANY');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<
    { kind: 'create' } | { kind: 'edit' | 'delete'; entry: Entry }
  >();
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [sector, setSector] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  async function fetchKind(next: DictionaryKind, after?: string) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ kind: next, ...(after ? { cursor: after } : {}) });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => (after ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
      setKind(next);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  function start(entry?: Entry, deleting = false) {
    setName(entry?.name ?? '');
    setAliases(entry?.aliases.join(', ') ?? '');
    setSector(entry?.sectorId ?? '');
    setReason('');
    setInvalid(false);
    setError(undefined);
    setChoice(entry ? { kind: deleting ? 'delete' : 'edit', entry } : { kind: 'create' });
  }
  function close() {
    if (pending) return;
    setChoice(undefined);
    setInvalid(false);
    setError(undefined);
  }
  async function submit() {
    if (!choice || pending) return;
    const names = aliases
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    let operation: (() => Promise<ActionResult<DictionaryEntryIdOutput>>) | undefined;
    if (choice.kind === 'create') {
      const parsed = createDictionaryEntrySchema.safeParse({
        kind,
        name,
        aliases: names,
        ...(kind === 'COMPANY' && sector ? { sectorId: sector } : {}),
      });
      if (parsed.success) operation = () => create(parsed.data);
    } else if (choice.kind === 'edit') {
      const parsed = updateDictionaryEntrySchema.safeParse({
        kind,
        id: choice.entry.id,
        name,
        aliases: names,
        ...(kind === 'COMPANY' ? { sectorId: sector || null } : {}),
      });
      if (parsed.success) operation = () => update(parsed.data);
    } else {
      const parsed = deleteDictionaryEntrySchema.safeParse({
        kind,
        id: choice.entry.id,
        reason,
        confirmed: true,
      });
      if (parsed.success) operation = () => remove(parsed.data);
    }
    if (!operation) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await operation();
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      const refreshed = await list({ kind });
      if (!refreshed.ok) {
        setError(refreshed.errorCode);
        return;
      }
      setItems(refreshed.data.items);
      setCursor(refreshed.data.nextCursor);
      setChoice(undefined);
      setNotice(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  return (
    <AdminFrame title={t('dictionary.title')}>
      <div className="flex flex-wrap items-end gap-4">
        <Field className="min-w-48" label={t('dictionary.kind')}>
          {(props) => (
            <Select
              {...props}
              value={kind}
              onChange={(e) => void fetchKind(e.target.value as DictionaryKind)}
            >
              {DICTIONARY_KINDS.map((v) => (
                <option key={v} value={v}>
                  {t(`dictionary.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button onClick={() => start()}>{t('add')}</Button>
      </div>
      {notice && (
        <p role="status" className="mt-4 text-on-success-soft">
          {t('success')}
        </p>
      )}
      {error && !choice && (
        <p role="alert" className="mt-4 text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-6" aria-busy={pending}>
        {items.length === 0 ? (
          <EmptyState
            title={t('empty')}
            description={t('emptyDescription')}
            action={<Button onClick={() => start()}>{t('add')}</Button>}
          />
        ) : (
          <ResponsiveRows
            headers={[t('name'), t('dictionary.aliases'), t('dictionary.sector'), t('actions')]}
            rows={items.map((entry) => ({
              id: entry.id,
              cells: [
                <div key="name">
                  {entry.name}
                  <p className="text-fg-muted">
                    {t('dictionary.usage', { count: entry.usageCount })}
                  </p>
                </div>,
                entry.aliases.join(', ') || t('none'),
                entry.sectorName ?? t('none'),
                <div key="actions" className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => start(entry)}>
                    {t('edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    className="border-danger text-danger"
                    onClick={() => start(entry, true)}
                  >
                    {t('delete')}
                  </Button>
                </div>,
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
          onClick={() => void fetchKind(kind, cursor)}
        >
          {t('more')}
        </Button>
      )}
      <Modal
        open={choice !== undefined}
        onClose={close}
        title={
          choice?.kind === 'delete'
            ? t('dictionary.deleteTitle')
            : choice?.kind === 'edit'
              ? t('edit')
              : t('add')
        }
        description={choice?.kind === 'delete' ? t('dictionary.deleteDescription') : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant={choice?.kind === 'delete' ? 'secondary' : 'primary'}
              className={choice?.kind === 'delete' ? 'border-danger text-danger' : undefined}
              loading={pending}
              onClick={() => void submit()}
            >
              {choice?.kind === 'delete' ? t('delete') : t('save')}
            </Button>
          </>
        }
      >
        {choice?.kind === 'delete' ? (
          <Field
            label={t('reason')}
            required
            hint={t('reasonHint')}
            error={invalid ? t('reasonInvalid') : undefined}
          >
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
              />
            )}
          </Field>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label={t('name')} required>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            {kind !== 'SECTOR' && (
              <Field label={t('dictionary.aliases')} hint={t('dictionary.aliasesHint')}>
                {(props) => (
                  <Input {...props} value={aliases} onChange={(e) => setAliases(e.target.value)} />
                )}
              </Field>
            )}
            {kind === 'COMPANY' && (
              <Field label={t('dictionary.sector')}>
                {(props) => (
                  <Select {...props} value={sector} onChange={(e) => setSector(e.target.value)}>
                    <option value="">{t('none')}</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {invalid && (
              <p role="alert" className="text-danger">
                {t('invalid')}
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </AdminFrame>
  );
}
