'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { stillThereInputSchema, type StillThereInput } from '@/contracts/notifications';
import { answerStillThere } from '@/server/actions/notifications';

export function StillThereForm() {
  const t = useTranslations('notifications.stillThere');
  const [input, setInput] = useState<StillThereInput | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'login' | 'yes' | 'no'>(
    'loading',
  );
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const fragment =
      window.location.hash.slice(1) || window.localStorage.getItem('stillThere') || '';
    const params = new URLSearchParams(fragment);
    const parsed = stillThereInputSchema.safeParse({
      token: params.get('token'),
      choice: params.get('choice'),
    });
    window.history.replaceState(null, '', window.location.pathname);
    let active = true;
    if (parsed.success) window.localStorage.setItem('stillThere', fragment);
    queueMicrotask(() => {
      if (!active) return;
      if (!parsed.success) {
        setState('invalid');
        return;
      }
      setInput(parsed.data);
      setState('ready');
    });
    return () => {
      active = false;
    };
  }, []);
  async function submit() {
    if (!input || pending) return;
    setPending(true);
    try {
      const result = await answerStillThere(input);
      if (!result.ok && result.errorCode === 'AUTH_UNAUTHENTICATED') {
        setState('login');
        return;
      }
      if (!result.ok || !result.data) {
        window.localStorage.removeItem('stillThere');
        setState('invalid');
        return;
      }
      window.localStorage.removeItem('stillThere');
      setState(result.data.choice === 'YES' ? 'yes' : 'no');
    } catch {
      setState('invalid');
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      {state === 'loading' && <p className="mt-5">{t('loading')}</p>}
      {state === 'ready' && (
        <>
          <p className="mt-5">{t('description')}</p>
          <div className="mt-8">
            <Button fullWidth size="lg" loading={pending} onClick={() => void submit()}>
              {input?.choice === 'YES' ? t('yes') : t('no')}
            </Button>
          </div>
        </>
      )}
      {state === 'login' && (
        <>
          <p className="mt-5">{t('loginNeeded')}</p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center text-primary"
            href="/giris?donus=%2Fbildirim-yanit"
          >
            {t('login')}
          </Link>
        </>
      )}
      {state === 'invalid' && (
        <p role="alert" className="mt-5">
          {t('invalid')}
        </p>
      )}
      {state === 'yes' && (
        <p role="status" className="mt-5">
          {t('successYes')}
        </p>
      )}
      {state === 'no' && (
        <p role="status" className="mt-5">
          {t('successNo')}
        </p>
      )}
      {state !== 'ready' && state !== 'loading' && state !== 'login' && (
        <Link className="mt-6 inline-flex min-h-11 items-center text-primary" href="/hesap">
          {t('profile')}
        </Link>
      )}
    </main>
  );
}
