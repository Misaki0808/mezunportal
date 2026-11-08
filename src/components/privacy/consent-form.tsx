'use client';
import { useHydrated } from '@/hooks/use-hydrated';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ConsentState } from '@/contracts/privacy';
import { recordConsentsSchema } from '@/contracts/privacy';
import { recordConsents } from '@/server/actions/privacy';
import { Badge, Button, Card, Checkbox } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export const LEGAL_PATHS = {
  PRIVACY_NOTICE: '/hukuki/aydinlatma',
  TERMS_OF_USE: '/hukuki/kullanim-sartlari',
  CROSS_BORDER_TRANSFER: '/hukuki/yurt-disi-aktarim',
} as const;
export function ConsentForm({
  state,
  returnTo = null,
}: {
  state: ConsentState;
  returnTo?: string | null;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('privacyScreens.consent');
  const common = useTranslations('privacyScreens.common');
  const router = useRouter();
  const form = usePrivacyForm();
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(
      state.documents.map((d) => [
        d.documentType,
        d.lastDecision?.version === d.currentVersion && d.lastDecision.granted,
      ]),
    ),
  );
  const [missing, setMissing] = useState<string[]>([]);
  return (
    <form
      data-hydrated={hydrated ? 'true' : undefined}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.busy) return;
        const absent = state.documents
          .filter((d) => d.required && !choices[d.documentType])
          .map((d) => d.documentType);
        setMissing(absent);
        if (absent.length) return;
        const input = form.parse(recordConsentsSchema, {
          decisions: state.documents.map((d) => ({
            documentType: d.documentType,
            version: d.currentVersion,
            granted: !!choices[d.documentType],
          })),
        });
        if (input)
          void form.run(
            () => recordConsents(input),
            () => {
              if (state.blocking) router.replace(returnTo ?? '/hesap');
              router.refresh();
            },
            t('saved'),
          );
      }}
    >
      <p className="rounded-control bg-warning-soft p-4 text-base text-on-warning-soft">
        {t('draft')}
      </p>
      {state.documents.map((d) => (
        <Card key={d.documentType} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t(d.documentType)}</h2>
            <Badge tone={d.required ? 'info' : 'neutral'}>
              {t(d.required ? 'required' : 'optional')}
            </Badge>
            {d.lastDecision && d.lastDecision.version !== d.currentVersion && (
              <Badge tone="warning">{t('updated')}</Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-base text-fg-muted">
              {t('version', { version: d.currentVersion })}
            </span>
            <Link
              href={LEGAL_PATHS[d.documentType]}
              className="press-row inline-flex min-h-11 items-center font-medium text-primary"
            >
              {common('read')}
            </Link>
          </div>
          <Checkbox
            label={t(d.required ? 'accept' : 'optionalAccept')}
            checked={!!choices[d.documentType]}
            disabled={form.busy}
            onChange={(e) => setChoices({ ...choices, [d.documentType]: e.target.checked })}
            aria-invalid={missing.includes(d.documentType) || undefined}
            aria-describedby={
              missing.includes(d.documentType) ? `${d.documentType}-error` : undefined
            }
          />
          {!d.required && <p className="text-base text-fg-muted">{t('optionalHint')}</p>}
          {missing.includes(d.documentType) && (
            <p id={`${d.documentType}-error`} role="alert" className="text-base text-danger">
              {t('requiredError')}
            </p>
          )}
        </Card>
      ))}
      {form.error && (
        <p role="alert" className="text-base text-danger">
          {form.error}
        </p>
      )}
      {form.failure?.errorCode === 'CONSENT_VERSION_OUTDATED' && (
        <Button variant="secondary" onClick={() => router.refresh()}>
          {common('retry')}
        </Button>
      )}
      <div className="sticky-actions rounded-control border border-border bg-bg p-3 shadow-card">
        <Button type="submit" fullWidth loading={form.busy}>
          {form.busy ? common('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
