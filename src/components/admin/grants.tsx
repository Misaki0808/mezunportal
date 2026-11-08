'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminReason, type AdminOverview } from '@/contracts/admin';
import {
  grantAdminSchema,
  revokeAdminSchema,
  searchUsersSchema,
  type AdminGrantPage,
  type AdminUserPage,
  type GrantAdminInput,
  type GrantAdminOutput,
  type ListAdminGrantsInput,
  type RevokeAdminInput,
  type RevokeAdminOutput,
  type SearchUsersInput,
} from '@/contracts/admin-users';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';
type Scope = 'SYSTEM' | 'FACULTY' | 'DEPARTMENT';
type Props = {
  initial: AdminGrantPage;
  departments: AdminOverview['departments'];
  list: (input: ListAdminGrantsInput) => Promise<ActionResult<AdminGrantPage>>;
  search: (input: SearchUsersInput) => Promise<ActionResult<AdminUserPage>>;
  grant: (input: GrantAdminInput) => Promise<ActionResult<GrantAdminOutput>>;
  revoke: (input: RevokeAdminInput) => Promise<ActionResult<RevokeAdminOutput>>;
};
export function AdminGrants({ initial, departments, list, search, grant, revoke }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserPage['items']>([]);
  const [searched, setSearched] = useState(false);
  const [userId, setUserId] = useState('');
  const [scope, setScope] = useState<Scope>('DEPARTMENT');
  const [department, setDepartment] = useState('');
  const [faculty, setFaculty] = useState('');
  const [choice, setChoice] = useState<{ kind: 'grant' } | { kind: 'revoke'; id: string }>();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  const faculties = [
    ...new Map(
      departments.map((d) => [d.facultyId, { id: d.facultyId, name: d.facultyName }]),
    ).values(),
  ];
  async function lookup() {
    if (pending) return;
    const parsed = searchUsersSchema.safeParse({ query });
    if (!parsed.success || !query.trim()) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setInvalid(false);
    setError(undefined);
    try {
      const result = await search(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setUsers(result.data.items);
      setSearched(true);
      setUserId('');
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  function close() {
    if (pending) return;
    setChoice(undefined);
    setReason('');
    setError(undefined);
    setInvalid(false);
  }
  async function submit() {
    if (!choice || pending) return;
    let operation: (() => Promise<ActionResult<unknown>>) | undefined;
    if (!adminReason.safeParse(reason).success) {
      setInvalid(true);
      return;
    }
    if (choice.kind === 'grant') {
      const input = {
        userId,
        scope,
        reason,
        confirmed: true,
        ...(scope === 'FACULTY'
          ? { facultyId: faculty }
          : scope === 'DEPARTMENT'
            ? { departmentId: department }
            : {}),
      };
      const parsed = grantAdminSchema.safeParse(input);
      if (parsed.success) operation = () => grant(parsed.data);
    } else {
      const parsed = revokeAdminSchema.safeParse({ grantId: choice.id, reason, confirmed: true });
      if (parsed.success) operation = () => revoke(parsed.data);
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
      const refreshed = await list({});
      if (!refreshed.ok) {
        setError(refreshed.errorCode);
        return;
      }
      setItems(refreshed.data.items);
      setCursor(refreshed.data.nextCursor);
      setChoice(undefined);
      setReason('');
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
    <AdminFrame title={t('grants.title')}>
      <section className="rounded-card border border-border p-5">
        <h2 className="text-xl font-semibold">{t('grants.grant')}</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="flex-1" label={t('users.searchLabel')} hint={t('users.searchHint')}>
            {(props) => (
              <Input
                {...props}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
              />
            )}
          </Field>
          <Button variant="secondary" loading={pending} onClick={() => void lookup()}>
            {t('search')}
          </Button>
        </div>
        {searched && users.length === 0 && (
          <p role="status" className="mt-4 text-fg-muted">
            {t('grants.noUsers')}
          </p>
        )}
        {users.length > 0 && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t('grants.user')} required>
              {(props) => (
                <Select {...props} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">{t('choose')}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} · {user.maskedEmail}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('grants.scope')}>
              {(props) => (
                <Select
                  {...props}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                >
                  {(['DEPARTMENT', 'FACULTY', 'SYSTEM'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`grants.${v}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {scope === 'FACULTY' && (
              <Field label={t('grants.faculty')} required>
                {(props) => (
                  <Select {...props} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
                    <option value="">{t('choose')}</option>
                    {faculties.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {scope === 'DEPARTMENT' && (
              <Field label={t('department')} required>
                {(props) => (
                  <Select
                    {...props}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">{t('choose')}</option>
                    {departments.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.facultyName}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        )}
        {invalid && !choice && (
          <p role="alert" className="mt-3 text-danger">
            {t('invalid')}
          </p>
        )}
        {users.length > 0 && (
          <Button
            className="mt-4"
            onClick={() => {
              setInvalid(false);
              setChoice({ kind: 'grant' });
            }}
          >
            {t('grants.grant')}
          </Button>
        )}
      </section>
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
      <div className="mt-7">
        {items.length === 0 ? (
          <EmptyState title={t('empty')} description={t('emptyDescription')} />
        ) : (
          <ResponsiveRows
            headers={[t('name'), t('maskedEmail'), t('grants.scope'), t('created'), t('actions')]}
            rows={items.map((entry) => ({
              id: entry.id,
              cells: [
                entry.userDisplayName,
                entry.maskedEmail,
                <span key="scope">
                  {t(`grants.${entry.scope}`)} ·{' '}
                  {entry.departmentName ?? entry.facultyName ?? t('all')}
                </span>,
                new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(
                  new Date(entry.grantedAt),
                ),
                <Button
                  key="revoke"
                  variant="secondary"
                  className="border-danger text-danger"
                  onClick={() => {
                    setInvalid(false);
                    setChoice({ kind: 'revoke', id: entry.id });
                  }}
                >
                  {t('grants.revoke')}
                </Button>,
              ],
            }))}
          />
        )}
      </div>
      {cursor && (
        <Button className="mt-5" variant="secondary" loading={pending} onClick={() => void more()}>
          {t('more')}
        </Button>
      )}
      <Modal
        open={choice !== undefined}
        onClose={close}
        title={choice?.kind === 'grant' ? t('grants.grantTitle') : t('grants.revokeTitle')}
        description={t('grants.confirmDescription')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant="secondary"
              className="border-danger text-danger"
              loading={pending}
              onClick={() => void submit()}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={invalid && reason.trim().length < 3 ? t('reasonInvalid') : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {invalid && reason.trim().length >= 3 && (
          <p role="alert" className="mt-3 text-danger">
            {t('invalid')}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </AdminFrame>
  );
}
