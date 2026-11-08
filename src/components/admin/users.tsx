'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import type { AdminUserPage, AdminUserSummary, SearchUsersInput } from '@/contracts/admin-users';
import { searchUsersSchema } from '@/contracts/admin-users';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, EmptyState, Field, Input, buttonClasses } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';

type Props = {
  initial: AdminUserPage;
  search: (input: SearchUsersInput) => Promise<ActionResult<AdminUserPage>>;
};
export function AdminUsers({ initial, search }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  async function load(value: string, after?: string) {
    if (pending) return;
    const parsed = searchUsersSchema.safeParse({
      ...(value.trim() ? { query: value.trim() } : {}),
      ...(after ? { cursor: after } : {}),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPending(true);
    setError(undefined);
    try {
      const result = await search(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
      setApplied(value);
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  const role = (item: AdminUserSummary) =>
    item.memberships
      .map(
        (membership) =>
          `${t(`users.${membership.role === 'STUDENT' ? 'roleStudent' : membership.role === 'ALUMNI' ? 'roleAlumni' : 'roleAcademic'}`)} · ${membership.departmentName}`,
      )
      .join(', ') || t('none');
  return (
    <AdminFrame title={t('users.title')}>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <Field
          className="flex-1"
          label={t('users.searchLabel')}
          hint={t('users.searchHint')}
          error={invalid ? t('users.searchInvalid') : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="search"
              autoComplete="off"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={pending}>
          {t('search')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-6" aria-busy={pending}>
        {items.length === 0 && !pending ? (
          <EmptyState
            title={t('empty')}
            description={t('emptyDescription')}
            action={
              <Button variant="secondary" onClick={() => void load('')}>
                {t('refresh')}
              </Button>
            }
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3 lg:hidden">
              {items.map((item) => (
                <li key={item.id} className="rounded-card border border-border p-5 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-lg font-semibold">{item.displayName}</h2>
                    <Badge tone={item.status === 'SUSPENDED' ? 'danger' : 'success'}>
                      {item.status === 'SUSPENDED' ? t('inactive') : t('active')}
                    </Badge>
                  </div>
                  <p className="mt-2 break-all text-base text-fg-muted">{item.maskedEmail}</p>
                  {item.maskedPhone && (
                    <p className="mt-1 text-base text-fg-muted">{item.maskedPhone}</p>
                  )}
                  <p className="mt-2 text-base">{role(item)}</p>
                  <Link
                    href={`/yonetim/kullanicilar/${item.id}`}
                    className={`${buttonClasses({ variant: 'secondary' })} mt-4`}
                  >
                    {t('details')}
                  </Link>
                </li>
              ))}
            </ul>
            <table className="hidden w-full border-collapse text-left lg:table">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">{t('name')}</th>
                  <th className="p-3">{t('maskedEmail')}</th>
                  <th className="p-3">{t('maskedPhone')}</th>
                  <th className="p-3">{t('role')}</th>
                  <th className="p-3">{t('status')}</th>
                  <th className="p-3">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="p-3">{item.displayName}</td>
                    <td className="p-3">{item.maskedEmail}</td>
                    <td className="p-3">{item.maskedPhone ?? t('none')}</td>
                    <td className="p-3">{role(item)}</td>
                    <td className="p-3">
                      {item.status === 'SUSPENDED' ? t('inactive') : t('active')}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/yonetim/kullanicilar/${item.id}`}
                        className={buttonClasses({ variant: 'secondary' })}
                      >
                        {t('details')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {cursor && (
          <div className="mt-5">
            <Button
              variant="secondary"
              loading={pending}
              onClick={() => void load(applied, cursor)}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
