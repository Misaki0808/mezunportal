'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import type { SignOutOutput } from '@/contracts/auth';
import type { ActionResult } from '@/contracts/result';
import { Button } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { forgetSignInAddress } from '@/lib/sign-in-address';

export function SignOutButton({ submit }: { submit: () => Promise<ActionResult<SignOutOutput>> }) {
  const t = useTranslations('authScreens.signOut');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  async function handleSignOut() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await submit();
      if (result.ok) {
        // Ortak bilgisayarda sonraki kişi bu sekmede öncekinin giriş adresini görmesin.
        forgetSignInAddress();
        router.replace('/giris');
        router.refresh();
      } else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-4 pb-[env(safe-area-inset-bottom)]">
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      <Button fullWidth size="lg" loading={pending} onClick={handleSignOut}>
        {pending ? t('pending') : t('submit')}
      </Button>
    </div>
  );
}
