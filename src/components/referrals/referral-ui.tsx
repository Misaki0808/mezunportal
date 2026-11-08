'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type FormEvent } from 'react';
import type { ReferralCandidates, ReferralPage, ReferralView } from '@/contracts/referrals';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import * as actions from '@/server/actions/referrals';

export function ReferralCreate({ candidates }: { candidates: ReferralCandidates }) {
  const t = useTranslations('referrals');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [studentId, setStudent] = useState('');
  const [organizationName, setOrganization] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await actions.proposeReferral({ studentId, organizationName, note });
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      router.push('/hesap/referanslar');
      router.refresh();
    });
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-32">
      <PageHeader title={t('createTitle')} description={t('createDescription')} />
      {!candidates.students.length ? (
        <div className="mt-8">
          <EmptyState title={t('emptyCandidates')} />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 grid gap-5">
          <Field label={t('student')} required>
            {(p) => (
              <Select {...p} value={studentId} onChange={(e) => setStudent(e.target.value)}>
                <option value="">{t('choose')}</option>
                {candidates.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.departmentName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('organization')} required>
            {(p) => (
              <Input
                {...p}
                autoComplete="organization"
                maxLength={120}
                value={organizationName}
                onChange={(e) => setOrganization(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('note')} hint={t('noteHint')}>
            {(p) => (
              <Textarea
                {...p}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="sticky bottom-0 bg-bg pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <Button type="submit" fullWidth loading={pending}>
              {t('send')}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}

export function ReferralList({
  initial,
  userId,
  moderation = false,
  canCreate = false,
}: {
  initial: ReferralPage;
  userId: string;
  moderation?: boolean;
  canCreate?: boolean;
}) {
  const t = useTranslations('referrals');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function perform(row: ReferralView, operation: 'CONFIRM' | 'REJECT' | 'ACCEPTANCE' | 'CANCEL') {
    start(async () => {
      setError('');
      const result = moderation
        ? await actions.reviewReferral({
            referralId: row.id,
            stage: row.status === 'STUDENT_CONFIRMED' ? 'REFERRAL' : 'ACCEPTANCE',
            decision: operation === 'CONFIRM' ? 'APPROVE' : 'REJECT',
            ...(operation === 'REJECT' ? { reason: reason[row.id] ?? '' } : {}),
          })
        : operation === 'ACCEPTANCE'
          ? await actions.proposeReferralAcceptance({
              referralId: row.id,
              note: note[row.id] ?? '',
            })
          : operation === 'CANCEL'
            ? await actions.cancelReferral({ referralId: row.id })
            : row.student.id === userId
              ? await actions.respondReferral({ referralId: row.id, decision: operation })
              : await actions.respondReferralAcceptance({
                  referralId: row.id,
                  decision: operation,
                });
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setPage((p) => ({
        ...p,
        items: moderation
          ? p.items.filter((item) => item.id !== row.id)
          : p.items.map((item) =>
              item.id === row.id ? { ...item, status: result.data.status } : item,
            ),
      }));
      router.refresh();
    });
  }
  function more() {
    if (!page.nextCursor) return;
    start(async () => {
      const input = { cursor: page.nextCursor! };
      const result = moderation
        ? await actions.listReferralModeration(input)
        : await actions.listMyReferrals(input);
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setPage((p) => ({
        items: [...p.items, ...result.data.items],
        nextCursor: result.data.nextCursor,
      }));
    });
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-32">
      <PageHeader
        title={t(moderation ? 'moderationTitle' : 'title')}
        description={t(moderation ? 'moderationDescription' : 'description')}
      />
      {canCreate && (
        <Link
          href="/referans/yeni"
          className="mt-5 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-semibold text-on-primary"
        >
          {t('create')}
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      {!page.items.length ? (
        <div className="mt-8">
          <EmptyState title={t('empty')} />
        </div>
      ) : (
        <ul className="mt-7 grid gap-4">
          {page.items.map((row) => {
            const student = row.student.id === userId;
            const alumni = row.alumnus.id === userId;
            const canRespond =
              moderation ||
              (student && row.status === 'PROPOSED') ||
              (alumni && row.status === 'ACCEPTED_PROPOSED');
            return (
              <li
                key={row.id}
                className="min-w-0 rounded-card border border-border bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-semibold">
                      {row.organizationName ?? '—'}
                    </h2>
                    <p className="mt-1 break-words text-fg-muted">
                      {t('studentLabel')}: {row.student.name} · {t('alumniLabel')}:{' '}
                      {row.alumnus.name}
                    </p>
                  </div>
                  <Badge>{t(`status.${row.status}`)}</Badge>
                </div>
                {row.note && <p className="mt-4 whitespace-pre-wrap break-words">{row.note}</p>}
                {row.acceptanceNote && (
                  <p className="mt-3 whitespace-pre-wrap break-words">{row.acceptanceNote}</p>
                )}
                {(row.decisionReason || row.acceptanceReason) && (
                  <p className="mt-3 break-words text-fg-muted">
                    {row.decisionReason ?? row.acceptanceReason}
                  </p>
                )}
                {moderation && (
                  <div className="mt-4">
                    <Field label={t('reason')} hint={t('reasonHint')}>
                      {(p) => (
                        <Textarea
                          {...p}
                          value={reason[row.id] ?? ''}
                          maxLength={1000}
                          onChange={(e) => setReason({ ...reason, [row.id]: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                )}
                {student && row.status === 'APPROVED' && (
                  <div className="mt-4">
                    <Field label={t('acceptanceNote')} hint={t('noteHint')}>
                      {(p) => (
                        <Textarea
                          {...p}
                          value={note[row.id] ?? ''}
                          maxLength={500}
                          onChange={(e) => setNote({ ...note, [row.id]: e.target.value })}
                        />
                      )}
                    </Field>
                    <div className="mt-3">
                      <Button loading={pending} onClick={() => perform(row, 'ACCEPTANCE')}>
                        {t('acceptance')}
                      </Button>
                    </div>
                  </div>
                )}
                {canRespond && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button loading={pending} onClick={() => perform(row, 'CONFIRM')}>
                      {t('approve')}
                    </Button>
                    <Button
                      variant="secondary"
                      loading={pending}
                      onClick={() => perform(row, 'REJECT')}
                    >
                      {t('reject')}
                    </Button>
                  </div>
                )}
                {alumni &&
                  [
                    'PROPOSED',
                    'STUDENT_CONFIRMED',
                    'APPROVED',
                    'ACCEPTED_PROPOSED',
                    'ACCEPTED_ALUMNI_CONFIRMED',
                    'ACCEPTED_APPROVED',
                    'ACCEPTED_REJECTED',
                  ].includes(row.status) && (
                    <div className="mt-3">
                      <Button
                        variant="danger-outline"
                        loading={pending}
                        onClick={() => perform(row, 'CANCEL')}
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor && (
        <div className="mt-5">
          <Button variant="secondary" loading={pending} onClick={more}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </main>
  );
}
