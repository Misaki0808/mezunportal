'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { safeClientAction } from '@/lib/safe-client-action';
import type { ErrorCode } from '@/lib/errors';
import { reportJobPosting } from '@/server/actions/job-postings';

export function ReportPosting({ postingId }: { postingId: string }) {
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<'reportMisleading' | 'reportInappropriate' | 'reportOther'>(
    'reportMisleading',
  );
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    const result = await safeClientAction(() =>
      reportJobPosting({
        postingId,
        reason: [t(reason), details.trim()].filter(Boolean).join(': '),
      }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.errorCode);
      return;
    }
    setSent(true);
    setOpen(false);
  }

  return (
    <div className="mt-6">
      {sent ? (
        <p role="status">{t('reportSent')}</p>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('reportTitle')}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={t('reportTitle')}
        description={t('reportDescription')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (!pending) setOpen(false);
              }}
            >
              {t('cancel')}
            </Button>
            <Button loading={pending} onClick={() => void submit()}>
              {t('reportSubmit')}
            </Button>
          </>
        }
      >
        <Field label={t('reportReason')}>
          {(props) => (
            <Select
              {...props}
              value={reason}
              onChange={(event) => setReason(event.target.value as typeof reason)}
            >
              <option value="reportMisleading">{t('reportMisleading')}</option>
              <option value="reportInappropriate">{t('reportInappropriate')}</option>
              <option value="reportOther">{t('reportOther')}</option>
            </Select>
          )}
        </Field>
        <div className="mt-4">
          <Field label={t('reportDetails')}>
            {(props) => (
              <Textarea
                {...props}
                value={details}
                maxLength={900}
                rows={4}
                onChange={(event) => setDetails(event.target.value)}
              />
            )}
          </Field>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </div>
  );
}
