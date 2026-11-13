'use client';
import { useHydrated } from '@/hooks/use-hydrated';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  declareMembershipSchema,
  ENTRY_YEAR_MIN,
  type DeclareMembershipInput,
  type DeclareMembershipOutput,
  type SelectableDepartment,
} from '@/contracts/auth';
import type { ActionResult, FieldErrors } from '@/contracts/result';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  buttonClasses,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

export function MembershipForm({
  role,
  departments,
  submit,
}: {
  role: 'STUDENT' | 'ACADEMIC';
  departments: SelectableDepartment[];
  submit: (input: DeclareMembershipInput) => Promise<ActionResult<DeclareMembershipOutput>>;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('authScreens.membership');
  const errors = useTranslations('errors.codes');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const locked = useRef(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const data = new FormData(event.currentTarget);
    const input =
      role === 'STUDENT'
        ? { role, departmentId: data.get('departmentId'), entryYear: Number(data.get('entryYear')) }
        : { role, departmentId: data.get('departmentId') };
    const parsed = declareMembershipSchema.safeParse(input);
    setFields({});
    setError(undefined);
    if (!parsed.success) {
      const next: Record<string, ErrorCode> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (field && !next[field]) next[field] = 'VALIDATION_INVALID';
      }
      setFields(next);
      const first = Object.keys(next)[0];
      const control = first ? event.currentTarget.elements.namedItem(first) : null;
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const result = await submit(parsed.data);
      if (result.ok) setComplete(true);
      else {
        setFields(result.fieldErrors ?? {});
        if (!result.fieldErrors || !Object.keys(result.fieldErrors).length)
          setError(result.errorCode);
      }
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  if (complete)
    return (
      <div role="status" className="flex flex-1 flex-col">
        <h1 className="mb-4 text-3xl font-semibold">{t('successTitle')}</h1>
        <p className="rounded-card bg-success-soft p-5 text-base text-on-success-soft">
          {t('success')}
        </p>
        <div className="mt-auto pt-8">
          <Link href="/baslangic" className={buttonClasses({ fullWidth: true, size: 'lg' })}>
            {t('start')}
          </Link>
        </div>
      </div>
    );
  if (!departments.length)
    return <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />;
  return (
    <form
      data-hydrated={hydrated ? 'true' : undefined}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col gap-5"
    >
      <PageHeader
        className="mb-5"
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      <Field
        className="[&_p]:text-base"
        label={t('department')}
        error={fields.departmentId ? t('departmentError') : undefined}
        required
      >
        {(control) => (
          <Select
            {...control}
            name="departmentId"
            defaultValue=""
            onChange={() =>
              setFields((current) => {
                const next = { ...current };
                delete next.departmentId;
                return next;
              })
            }
          >
            <option value="">{t('departmentPlaceholder')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name} · {department.facultyName} · {department.universityName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {role === 'STUDENT' && (
        <Field
          className="[&_p]:text-base"
          label={t('entryYear')}
          error={
            fields.entryYear
              ? t('yearError', { min: ENTRY_YEAR_MIN, max: new Date().getFullYear() })
              : undefined
          }
          required
        >
          {(control) => (
            <Input
              {...control}
              name="entryYear"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              onChange={() =>
                setFields((current) => {
                  const next = { ...current };
                  delete next.entryYear;
                  return next;
                })
              }
            />
          )}
        </Field>
      )}
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-auto pt-5 pb-[env(safe-area-inset-bottom)]">
        <Button type="submit" fullWidth size="lg" loading={pending}>
          {pending ? t('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
