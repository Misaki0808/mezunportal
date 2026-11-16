'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { recordConsents } from '@/server/actions/privacy';
import type { ErrorCode } from '@/lib/errors';
/** KVKK ekranında zorunlu onay beklerken de ayrı rıza geri alınabilir. */
export function PhotoConsentWithdrawal() {
  const t = useTranslations('profilePhoto');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [removed, setRemoved] = useState(false);
  return (
    <div className="space-y-2">
      {!removed && (
        <Button
          variant="secondary"
          loading={pending}
          onClick={async () => {
            if (pending) return;
            setPending(true);
            setError(undefined);
            try {
              const result = await recordConsents({
                decisions: [
                  {
                    documentType: 'PROFILE_PHOTO_VISIBILITY',
                    version: CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
                    granted: false,
                  },
                ],
              });
              if (!result.ok) {
                setError(result.errorCode);
                return;
              }
              setRemoved(true);
              router.refresh();
            } catch {
              setError('SERVER_UNEXPECTED');
            } finally {
              setPending(false);
            }
          }}
        >
          {t('remove')}
        </Button>
      )}
      {removed && <p role="status">{t('removed')}</p>}
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
    </div>
  );
}
