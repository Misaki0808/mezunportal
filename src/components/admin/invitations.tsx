'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { parseInvitationEntries } from '@/lib/invitation-validation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { sendInvitations } from '@/server/actions/invitations';
import { Button, Field, FilePicker, Textarea } from '@/components/ui';
import { AdminFrame } from './frame';

export function Invitations() {
  const t = useTranslations('invitations');
  const errors = useTranslations('errors.codes');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textInvalid, setTextInvalid] = useState(false);
  const textField = useRef<HTMLTextAreaElement>(null);
  const [result, setResult] = useState<{ queued: number; skipped: number } | null>(null);
  const [pending, start] = useTransition();
  // Eşzamanlı kilit: iki hızlı tıklama aynı React grubuna düşerse `pending` henüz `true` olmaz; diğer formlar gibi `ref` ile engellenir.
  const locked = useRef(false);
  return (
    <AdminFrame title={t('title')} description={t('description')}>
      <form
        noValidate
        className="max-w-2xl space-y-4 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (locked.current) return;
          if (!parseInvitationEntries(text)) {
            setTextInvalid(true);
            textField.current?.focus();
            return;
          }
          setTextInvalid(false);
          locked.current = true;
          setError(null);
          setResult(null);
          start(async () => {
            try {
              const response = await safeClientAction(() => sendInvitations(text));
              if (response.ok) setResult(response.data);
              else if (response.errorCode === 'VALIDATION_INVALID') {
                setTextInvalid(true);
                textField.current?.focus();
              } else setError(response.errorCode);
            } finally {
              locked.current = false;
            }
          });
        }}
      >
        {/* Kit `Textarea`: ham `<textarea>` dekoratif `border` token'ıyla çizilmişti (koyu temada 1,77:1; kontrol sınırı 3:1 ister). */}
        <Field
          label={t('label')}
          hint={t('help')}
          error={textInvalid ? errors('VALIDATION_INVALID') : undefined}
          required
        >
          {(control) => (
            <Textarea
              {...control}
              ref={textField}
              className="min-h-48"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setTextInvalid(false);
              }}
            />
          )}
        </Field>
        <Field label={t('file')} error={fileError ?? undefined}>
          {(control) => (
            <FilePicker
              {...control}
              accept=".csv,.txt,text/csv,text/plain"
              fileName={fileName}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file && file.size <= 30000) {
                  setText(await file.text());
                  setTextInvalid(false);
                  setFileName(file.name);
                  setError(null);
                  setFileError(null);
                } else if (file) {
                  setFileName('');
                  setFileError(t('fileTooLarge'));
                }
              }}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-danger">
            {errors(error as Parameters<typeof errors>[0])}
          </p>
        )}
        {result && <p role="status">{t('result', result)}</p>}
        <Button type="submit" loading={pending}>
          {pending ? t('sending') : t('submit')}
        </Button>
      </form>
    </AdminFrame>
  );
}
