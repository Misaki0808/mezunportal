'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { SelectableDepartment } from '@/contracts/auth';
import {
  graduationDocumentFormInput,
  graduationDocumentFormSchema,
  type UploadGraduationDocumentOutput,
} from '@/contracts/graduation-document';
import type { ActionResult, FieldErrors } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Select, buttonClasses } from '@/components/ui';
import { isErrorCode, type ErrorCode } from '@/lib/errors';

export function DocumentForm({
  departments,
  submit,
}: {
  departments: SelectableDepartment[];
  submit: (data: FormData) => Promise<ActionResult<UploadGraduationDocumentOutput>>;
}) {
  const t = useTranslations('authScreens.document');
  const errors = useTranslations('errors.codes');
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState('');
  const [complete, setComplete] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ErrorCode>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = form.elements.namedItem('file');
    if (input instanceof HTMLInputElement && input.files?.[0]) data.set('file', input.files[0]);
    const parsed = graduationDocumentFormSchema.safeParse(graduationDocumentFormInput(data));
    setFields({});
    setError(undefined);
    if (!parsed.success) {
      const next: Record<string, ErrorCode> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (field && !next[field])
          next[field] = isErrorCode(issue.message) ? issue.message : 'VALIDATION_INVALID';
      }
      setFields(next);
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const result = await submit(data);
      if (result.ok) setComplete(true);
      else {
        setFields(result.fieldErrors ?? {});
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
        <p className="rounded-card bg-success-soft p-5 text-base text-on-success-soft">
          {t('success')}
        </p>
        <div className="mt-auto pt-8">
          <Link href="/dogrulama" className={buttonClasses({ fullWidth: true, size: 'lg' })}>
            {t('status')}
          </Link>
        </div>
      </div>
    );
  if (!departments.length)
    return <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />;
  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
      <Field
        className="[&_p]:text-base"
        label={t('department')}
        error={fields.departmentId ? errors(fields.departmentId) : undefined}
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
      <Field
        className="[&_p]:text-base"
        label={t('year')}
        error={fields.graduationYear ? errors(fields.graduationYear) : undefined}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="graduationYear"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            onChange={() =>
              setFields((current) => {
                const next = { ...current };
                delete next.graduationYear;
                return next;
              })
            }
          />
        )}
      </Field>
      <Field
        className="[&_p]:text-base"
        label={t('file')}
        hint={t('fileHint')}
        error={fields.file ? errors(fields.file) : undefined}
        required
      >
        {(control) => (
          <div className="relative flex min-h-11 items-center rounded-control border border-border-control bg-bg px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
            <span aria-hidden="true" className="min-w-0 truncate text-base text-fg">
              {fileName || t('chooseFile')}
            </span>
            <Input
              {...control}
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(event) => {
                setFileName(event.target.files?.[0]?.name ?? '');
                setFields((current) => {
                  const next = { ...current };
                  delete next.file;
                  return next;
                });
              }}
            />
          </div>
        )}
      </Field>
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-auto pt-4 pb-[env(safe-area-inset-bottom)]">
        <Button type="submit" fullWidth size="lg" loading={pending}>
          {pending ? t('sending') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
