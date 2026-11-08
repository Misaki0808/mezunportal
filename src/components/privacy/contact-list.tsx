'use client';
import { useHydrated } from '@/hooks/use-hydrated';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import {
  type ContactRequestPage,
  type ContactRequestItem,
  closeContactRequestSchema,
  respondToContactRequestSchema,
  listContactRequestsSchema,
} from '@/contracts/contact-request';
import {
  listContactRequests,
  respondToContactRequest,
  revokeContactRequest,
  withdrawContactRequest,
} from '@/server/actions/contact-request';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Tabs,
  SkeletonText,
  buttonClasses,
} from '@/components/ui';
import { usePrivacyForm } from './form-state';

type Box = 'INCOMING' | 'OUTGOING';
type Closing = { id: string; kind: 'reject' | 'revoke' | 'withdraw' };
export function ContactList({
  initial,
  initialBox,
}: {
  initial: ContactRequestPage;
  initialBox: Box;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('privacyScreens.contacts');
  const fields = useTranslations('privacyScreens.fields');
  const common = useTranslations('privacyScreens.common');
  const format = useFormatter();
  const form = usePrivacyForm();
  const [loading, setLoading] = useState(false);
  const [box, setBox] = useState<Box>(initialBox);
  const [page, setPage] = useState(initial);
  const [closing, setClosing] = useState<Closing | null>(null);
  async function load(nextBox: Box, more = false) {
    const input = form.parse(listContactRequestsSchema, {
      box: nextBox,
      ...(more && page.nextCursor ? { cursor: page.nextCursor } : {}),
    });
    if (!input) return;
    setLoading(true);
    await form.run(
      () => listContactRequests(input),
      (data) => {
        setBox(nextBox);
        setPage(more ? { ...data, items: [...page.items, ...data.items] } : data);
      },
    );
    setLoading(false);
  }
  async function refresh() {
    const result = await listContactRequests({ box });
    if (!result.ok) throw new Error('refresh');
    setPage(result.data);
    setClosing(null);
  }
  function approve(item: ContactRequestItem) {
    const input = form.parse(respondToContactRequestSchema, {
      requestId: item.id,
      decision: 'APPROVE',
    });
    if (input) void form.run(() => respondToContactRequest(input), refresh, t('changed'));
  }
  function close() {
    if (!closing) return;
    const { id, kind } = closing;
    if (kind === 'reject') {
      const input = form.parse(respondToContactRequestSchema, {
        requestId: id,
        decision: 'REJECT',
      });
      if (input) void form.run(() => respondToContactRequest(input), refresh, t('changed'));
    } else {
      const input = form.parse(closeContactRequestSchema, { requestId: id });
      if (input)
        void form.run(
          () => (kind === 'revoke' ? revokeContactRequest(input) : withdrawContactRequest(input)),
          refresh,
          t('changed'),
        );
    }
  }
  const content = (
    <div className="space-y-4" aria-busy={form.busy}>
      {loading ? (
        <div role="status" className="space-y-4 py-6">
          <span className="sr-only">{common('loading')}</span>
          <SkeletonText lines={4} />
        </div>
      ) : page.items.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Link href="/hesap/gizlilik" className={buttonClasses({ variant: 'secondary' })}>
              {t('settings')}
            </Link>
          }
        />
      ) : (
        page.items.map((item) => (
          <Card key={item.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold">{item.counterpart.name}</h2>
                <p className="mt-1 text-base text-fg-muted">
                  {format.dateTime(item.createdAt, {
                    dateStyle: 'medium',
                    timeZone: 'Europe/Istanbul',
                  })}
                </p>
              </div>
              <Badge
                tone={
                  item.status === 'APPROVED'
                    ? 'success'
                    : item.status === 'PENDING'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {t(item.status)}
              </Badge>
            </div>
            <p className="text-base text-fg-muted">
              {t('requested')}:{' '}
              <span className="text-fg">{item.fields.map((f) => fields(f)).join(', ')}</span>
            </p>
            {item.message && (
              <p className="break-words rounded-control bg-surface p-3 text-base">{item.message}</p>
            )}
            {item.revealed && Object.keys(item.revealed).length > 0 && (
              <div className="rounded-control bg-success-soft p-4 text-on-success-soft">
                <h3 className="mb-2 font-semibold">{t('shared')}</h3>
                <dl className="space-y-2">
                  {Object.entries(item.revealed).map(([field, value]) => (
                    <div key={field}>
                      <dt className="font-medium">
                        {fields(field as ContactRequestItem['fields'][number])}
                      </dt>
                      <dd className="break-all">
                        {typeof value === 'object' && value !== null ? (
                          Object.entries(value)
                            .map(([label, url]) => `${label}: ${url}`)
                            .join(', ')
                        ) : field === 'EMAIL' && typeof value === 'string' ? (
                          <a className="underline" href={`mailto:${value}`}>
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {box === 'OUTGOING' &&
              item.status === 'APPROVED' &&
              item.fields.some((field) => !item.revealed?.[field]) && (
                <p className="text-base text-fg-muted">
                  {t('unavailableFields', {
                    fields: item.fields
                      .filter((field) => !item.revealed?.[field])
                      .map((field) => fields(field))
                      .join(', '),
                  })}
                </p>
              )}
            <div className="flex flex-wrap gap-3">
              {box === 'INCOMING' && item.status === 'PENDING' && (
                <>
                  <Button loading={form.busy} onClick={() => approve(item)}>
                    {t('approve')}
                  </Button>
                  <Button
                    variant="secondary"
                    loading={form.busy}
                    onClick={() => setClosing({ id: item.id, kind: 'reject' })}
                  >
                    {t('reject')}
                  </Button>
                </>
              )}
              {box === 'INCOMING' && item.status === 'APPROVED' && (
                <Button
                  variant="secondary"
                  loading={form.busy}
                  onClick={() => setClosing({ id: item.id, kind: 'revoke' })}
                >
                  {t('revoke')}
                </Button>
              )}
              {box === 'OUTGOING' && item.status === 'PENDING' && (
                <Button
                  variant="secondary"
                  loading={form.busy}
                  onClick={() => setClosing({ id: item.id, kind: 'withdraw' })}
                >
                  {t('withdraw')}
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
      {page.nextCursor && (
        <Button fullWidth variant="secondary" loading={form.busy} onClick={() => load(box, true)}>
          {t('more')}
        </Button>
      )}
    </div>
  );
  return (
    <div data-hydrated={hydrated ? 'true' : undefined}>
      <Tabs
        label={t('tabs')}
        value={box}
        onValueChange={(value) => {
          if (!form.busy) load(value as Box);
        }}
        items={[
          { id: 'INCOMING', label: t('incoming'), content },
          { id: 'OUTGOING', label: t('outgoing'), content },
        ]}
      />
      {form.error && (
        <p role="alert" className="mt-4 text-base text-danger">
          {form.error}
        </p>
      )}
      <Modal
        open={!!closing}
        onClose={() => {
          if (!form.busy) setClosing(null);
        }}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(null)}>
              {common('cancel')}
            </Button>
            <Button variant="danger" loading={form.busy} onClick={close}>
              {t(closing?.kind ?? 'reject')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
