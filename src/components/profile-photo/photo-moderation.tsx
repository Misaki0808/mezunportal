'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar, Button, Field, Modal, Textarea } from '@/components/ui';
import { removeProfilePhoto } from '@/server/actions/profile-photo';
import type { ErrorCode } from '@/lib/errors';

export function PhotoModeration({
  userId,
  name,
  photoSrc,
}: {
  userId: string;
  name: string;
  photoSrc?: string;
}) {
  const t = useTranslations('profilePhoto');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [removed, setRemoved] = useState(false);
  return (
    <section className="space-y-3">
      {!removed && <Avatar src={photoSrc} name={name} size="lg" />}
      <Button
        variant="secondary"
        {...(removed
          ? { disabled: true as const, disabledReason: t('moderated') }
          : { disabled: false as const })}
        onClick={() => {
          setReason('');
          setError(undefined);
          setOpen(true);
        }}
      >
        {t('moderate')}
      </Button>
      {removed && <p role="status">{t('moderated')}</p>}
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={t('moderationTitle')}
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError(undefined);
            try {
              const result = await removeProfilePhoto({ userId, reason });
              if (!result.ok) {
                setError(result.errorCode);
                return;
              }
              setRemoved(true);
              setOpen(false);
              router.refresh();
            } catch {
              setError('SERVER_UNEXPECTED');
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label={t('reason')}>
            {(control) => (
              <Textarea
                {...control}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                minLength={3}
                maxLength={1000}
                disabled={pending}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {errors(error)}
            </p>
          )}
          <Button type="submit" loading={pending}>
            {t('moderate')}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
