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
import { ResponsiveRows } from './responsive-rows';

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
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <Field
          className="min-w-0 flex-1"
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
        {/* Düğme girdiyle hizalı: etiket satırı (1,75 rem) + boşluk (0,375 rem) kadar aşağıda; ipucu satırı hizayı bozmaz. */}
        <div className="sm:mt-[2.125rem]">
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
            <ResponsiveRows
              columnWidths={['18%', '26%', '12%', '18%', '12%', '14%']}
              headers={[
                t('name'),
                t('maskedEmail'),
                t('maskedPhone'),
                t('role'),
                t('status'),
                t('actions'),
              ]}
              rows={items.map((item) => ({
                id: item.id,
                cells: [
                  <h2 key="name" className="text-base font-semibold">
                    {item.displayName}
                  </h2>,
                  item.maskedEmail,
                  item.maskedPhone ?? t('none'),
                  role(item),
                  <Badge key="status" tone={item.status === 'SUSPENDED' ? 'danger' : 'success'}>
                    {item.status === 'SUSPENDED' ? t('inactive') : t('active')}
                  </Badge>,
                  <Link
                    key="details"
                    href={`/yonetim/kullanicilar/${item.id}`}
                    className={`${buttonClasses({ variant: 'secondary' })} w-full lg:w-auto`}
                    aria-label={t('detailsFor', { name: item.displayName })}
                  >
                    {t('details')}
                  </Link>,
                ],
              }))}
            />
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
