'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { AdminFrame } from '@/components/admin/frame';
import {
  GOOGLE_CONNECT_HREF,
  type DisconnectGoogleCalendarOutput,
  type GoogleCalendarStatus,
  type GoogleConnectOutcome,
} from '@/contracts/google-calendar';
import type { ActionResult } from '@/contracts/result';
import {
  Badge,
  Button,
  Card,
  Modal,
  buttonClasses,
  useToast,
  type BadgeTone,
} from '@/components/ui';

type StateKey = 'OFF' | 'FAKE' | 'GOOGLE_MISSING' | 'NONE' | 'ACTIVE' | 'NEEDS_RECONNECT';

function stateOf(status: GoogleCalendarStatus): StateKey {
  if (status.mode === 'OFF') return 'OFF';
  if (status.mode === 'FAKE') return 'FAKE';
  if (!status.configured) return 'GOOGLE_MISSING';
  return status.connection === 'NONE' ? 'NONE' : status.connection;
}

const TONE: Record<StateKey, BadgeTone> = {
  OFF: 'neutral',
  FAKE: 'neutral',
  GOOGLE_MISSING: 'warning',
  NONE: 'warning',
  ACTIVE: 'success',
  NEEDS_RECONNECT: 'warning',
};

const formatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export function GoogleCalendarPanel({
  status,
  outcome,
  disconnect,
}: {
  status: GoogleCalendarStatus;
  outcome: GoogleConnectOutcome | null;
  disconnect: () => Promise<ActionResult<DisconnectGoogleCalendarOutput>>;
}) {
  const t = useTranslations('googleCalendar');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const state = stateOf(status);
  const canConnect = state === 'NONE' || state === 'NEEDS_RECONNECT';
  const connected = status.connection !== 'NONE';

  function confirmDisconnect() {
    startTransition(async () => {
      const result = await disconnect();
      setConfirming(false);
      if (!result.ok) {
        toast.show({ message: errors(result.errorCode), tone: 'error' });
        return;
      }
      toast.show({
        message: t(result.data.revoked ? 'disconnected' : 'disconnectedNotRevoked'),
        tone: 'success',
      });
      router.refresh();
    });
  }

  return (
    <AdminFrame title={t('title')} description={t('description')}>
      {outcome && (
        <p
          role="status"
          className={`mb-5 rounded-card border p-4 font-medium ${
            outcome === 'connected'
              ? 'border-success bg-success-soft text-on-success-soft'
              : 'border-warning bg-warning-soft text-on-warning-soft'
          }`}
        >
          {t(`outcome.${outcome}`)}
        </p>
      )}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={TONE[state]}>{t(`state.${state}`)}</Badge>
        </div>
        <p className="text-base leading-relaxed text-fg-muted">{t(`explain.${state}`)}</p>
        {connected && (
          <dl className="grid gap-2 text-base sm:grid-cols-2">
            {status.accountLabel && (
              <div>
                <dt className="text-fg-muted">{t('account')}</dt>
                <dd className="font-semibold">{status.accountLabel}</dd>
              </div>
            )}
            {status.connectedAt && (
              <div>
                <dt className="text-fg-muted">{t('connectedAt')}</dt>
                <dd className="font-semibold">{formatter.format(status.connectedAt)}</dd>
              </div>
            )}
          </dl>
        )}
        {status.redirectUri && (
          <div>
            <p className="text-fg-muted">{t('redirectUri')}</p>
            <code className="mt-1 block overflow-x-auto rounded-control bg-surface-strong p-3 text-sm [overflow-wrap:anywhere]">
              {status.redirectUri}
            </code>
            <p className="mt-1 text-sm text-fg-muted">{t('redirectUriHint')}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {canConnect && (
            <a href={GOOGLE_CONNECT_HREF} className={buttonClasses({ variant: 'primary' })}>
              {t(state === 'NEEDS_RECONNECT' ? 'reconnect' : 'connect')}
            </a>
          )}
          {connected && (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t('disconnect')}
            </Button>
          )}
        </div>
      </Card>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('disconnectTitle')}
        description={t('disconnectDescription')}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" loading={pending} onClick={confirmDisconnect}>
              {t('disconnectConfirm')}
            </Button>
          </div>
        }
      >
        <span className="sr-only">{t('disconnectTitle')}</span>
      </Modal>
    </AdminFrame>
  );
}
