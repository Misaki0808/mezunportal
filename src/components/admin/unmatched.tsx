'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  resolveUnmatchedValueSchema,
  listDictionaryEntriesSchema,
  type ListDictionaryEntriesInput,
  type DictionaryEntryPage,
  type ListUnmatchedValuesInput,
  type UnmatchedValuePage,
  type ResolveUnmatchedValueInput,
  type ResolveUnmatchedValueOutput,
} from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';
type Entry = UnmatchedValuePage['items'][number];
type Props = {
  initial: UnmatchedValuePage;
  searchEntries: (input: ListDictionaryEntriesInput) => Promise<ActionResult<DictionaryEntryPage>>;
  list: (input: ListUnmatchedValuesInput) => Promise<ActionResult<UnmatchedValuePage>>;
  resolve: (
    input: ResolveUnmatchedValueInput,
  ) => Promise<ActionResult<ResolveUnmatchedValueOutput>>;
};
export function UnmatchedValues({ initial, list, resolve, searchEntries }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<{ entry: Entry; kind: 'LINK' | 'CREATE' | 'DISMISS' }>();
  const [entryId, setEntryId] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  function start(entry: Entry, kind: 'LINK' | 'CREATE' | 'DISMISS') {
    setChoice({ entry, kind });
    setEntryId(entry.suggestions[0]?.id ?? '');
    setCandidates(entry.suggestions);
    setQuery('');
    setName(entry.rawValue);
    setReason('');
    setInvalid(false);
    setError(undefined);
  }
  function close() {
    if (pending) return;
    setChoice(undefined);
    setError(undefined);
    setInvalid(false);
  }
  async function searchDictionary() {
    if (!choice || pending) return;
    const parsed = listDictionaryEntriesSchema.safeParse({ kind: choice.entry.kind, query });
    if (!parsed.success || !query.trim()) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setInvalid(false);
    setError(undefined);
    try {
      const result = await searchEntries(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setCandidates(result.data.items);
      setEntryId(result.data.items[0]?.id ?? '');
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    if (!choice || pending) return;
    const resolution =
      choice.kind === 'LINK'
        ? { type: 'LINK', entryId }
        : choice.kind === 'CREATE'
          ? { type: 'CREATE', name, aliases: [] }
          : { type: 'DISMISS', reason, confirmed: true };
    const parsed = resolveUnmatchedValueSchema.safeParse({ id: choice.entry.id, resolution });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await resolve(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => old.filter((v) => v.id !== choice.entry.id));
      setChoice(undefined);
      setNotice(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  async function more() {
    if (!cursor || pending) return;
    setPending(true);
    try {
      const result = await list({ cursor });
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
    <AdminFrame title={t('dictionary.unmatched')}>
      {notice && (
        <p role="status" className="mb-4 text-on-success-soft">
          {t('success')}
        </p>
      )}
      {error && !choice && (
        <p role="alert" className="mb-4 text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <ResponsiveRows
          headers={[t('name'), t('dictionary.kind'), t('dictionary.usageLabel'), t('actions')]}
          rows={items.map((entry) => ({
            id: entry.id,
            cells: [
              entry.rawValue,
              t(`dictionary.${entry.kind}`),
              String(entry.count),
              <div key="actions" className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => start(entry, 'LINK')}>
                  {t('dictionary.link')}
                </Button>
                <Button variant="secondary" onClick={() => start(entry, 'CREATE')}>
                  {t('dictionary.create')}
                </Button>
                <Button
                  variant="secondary"
                  className="border-danger text-danger"
                  onClick={() => start(entry, 'DISMISS')}
                >
                  {t('dictionary.dismiss')}
                </Button>
              </div>,
            ],
          }))}
        />
      )}{' '}
      {cursor && (
        <Button className="mt-5" variant="secondary" loading={pending} onClick={() => void more()}>
          {t('more')}
        </Button>
      )}
      <Modal
        open={choice !== undefined}
        onClose={close}
        title={
          choice?.kind === 'LINK'
            ? t('dictionary.link')
            : choice?.kind === 'CREATE'
              ? t('dictionary.create')
              : t('dictionary.dismiss')
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant={choice?.kind === 'DISMISS' ? 'secondary' : 'primary'}
              className={choice?.kind === 'DISMISS' ? 'border-danger text-danger' : undefined}
              loading={pending}
              onClick={() => void submit()}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        {choice?.kind === 'LINK' && (
          <div className="space-y-4">
            <Field label={t('dictionary.searchEntry')} hint={t('users.searchHint')}>
              {(props) => (
                <Input {...props} value={query} onChange={(e) => setQuery(e.target.value)} />
              )}
            </Field>
            <Button variant="secondary" loading={pending} onClick={() => void searchDictionary()}>
              {t('search')}
            </Button>
            {candidates.length > 0 ? (
              <Field label={t('dictionary.entry')} required>
                {(props) => (
                  <Select {...props} value={entryId} onChange={(e) => setEntryId(e.target.value)}>
                    {candidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <p>{t('dictionary.noSuggestions')}</p>
            )}
          </div>
        )}
        {choice?.kind === 'CREATE' && (
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
        )}
        {choice?.kind === 'DISMISS' && (
          <Field
            label={t('reason')}
            hint={t('reasonHint')}
            required
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
        )}
        {invalid && choice?.kind !== 'DISMISS' && (
          <p role="alert" className="mt-4 text-danger">
            {t('invalid')}
          </p>
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
