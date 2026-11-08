'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  reportExperienceSchema,
  type ReportExperienceInput,
  type ReportExperienceOutput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Sheet, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  experienceId: string;
  report: (input: ReportExperienceInput) => Promise<ActionResult<ReportExperienceOutput>>;
};

/** Şikâyet: alt sayfa, gerekçe zorunlu; hız sınırı ve “zaten açık şikâyet” mesajları katalogdan. */
export function ReportExperience({ experienceId, report }: Props) {
  const t = useTranslations('experiences.report');
  const errors = useTranslations('errors.codes');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonInvalid, setReasonInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(undefined);
    setReasonInvalid(false);
  }

  async function submit() {
    if (locked.current) return;
    const parsed = reportExperienceSchema.safeParse({ experienceId, reason });
    if (!parsed.success) {
      setReasonInvalid(true);
      return;
    }
    locked.current = true;
    setPending(true);
    setReasonInvalid(false);
    setError(undefined);
    try {
      const result = await report(parsed.data);
      if (result.ok) {
        setSent(true);
        setOpen(false);
        setReason('');
      } else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {sent ? (
        <p role="status" className="text-base text-on-success-soft">
          {t('sent')}
        </p>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('title')}
        </Button>
      )}
      <Sheet
        open={open}
        onClose={close}
        title={t('title')}
        description={t('description')}
        footer={
          <>
            <Button fullWidth loading={pending} onClick={() => void submit()}>
              {t('submit')}
            </Button>
            <Button variant="secondary" fullWidth onClick={close}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={reasonInvalid ? t('reasonInvalid') : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="mt-3 text-base text-danger">
            {errors(error)}
          </p>
        )}
      </Sheet>
    </>
  );
}
