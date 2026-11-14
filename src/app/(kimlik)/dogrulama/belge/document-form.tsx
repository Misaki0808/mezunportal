'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { SelectableDepartment } from '@/contracts/auth';
import {
  graduationDocumentFormInput,
  graduationDocumentFormSchema,
  type UploadGraduationDocumentOutput,
} from '@/contracts/graduation-document';
import type { ActionResult, FieldErrors } from '@/contracts/result';
import {
  Button,
  EmptyState,
  Field,
  FilePicker,
  Input,
  Select,
  buttonClasses,
  focusFirstInvalid,
} from '@/components/ui';
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
  const [complete, setComplete] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ErrorCode>();
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  // Hatalı gönderimde odak ilk hatalı alana gider (alan mesajı `aria-describedby` ile okunur); başarıda sonuç metnine.
  useEffect(() => {
    if (focusTick > 0) focusFirstInvalid(formRef.current);
  }, [focusTick]);
  useEffect(() => {
    if (complete) doneRef.current?.focus();
  }, [complete]);

  // Genel "Formda eksik ya da uymayan bir alan var." her alanda aynı metinle çıkmasın: bölüm ve yıl kendi cümlesini söyler;
  // dosya alanı ve sunucunun verdiği özel kodlar kendi metnini korur.
  function fieldMessage(field: string, specific: string) {
    const code = fields[field];
    if (!code) return undefined;
    return code === 'VALIDATION_INVALID' ? specific : errors(code);
  }

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
      setFocusTick((tick) => tick + 1);
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
        if (Object.keys(result.fieldErrors ?? {}).length > 0) setFocusTick((tick) => tick + 1);
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
      <div className="flex flex-1 flex-col">
        <p
          ref={doneRef}
          tabIndex={-1}
          className="rounded-card bg-success-soft p-5 text-base text-on-success-soft focus:outline-none"
        >
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
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
      <Field
        className="[&_p]:text-base"
        label={t('department')}
        error={fieldMessage('departmentId', t('departmentError'))}
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
        error={fieldMessage('graduationYear', t('yearError'))}
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
          <FilePicker
            {...control}
            name="file"
            accept="application/pdf,.pdf"
            chooseLabel={t('chooseFile')}
            onChange={() =>
              setFields((current) => {
                const next = { ...current };
                delete next.file;
                return next;
              })
            }
          />
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
