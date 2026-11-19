'use client';
import { AdminList, AdminListItem } from '@/components/admin/list';
import { useQueueFocus } from '@/components/admin/use-queue-focus';
import { safeClientAction } from '@/lib/safe-client-action';
import { userTextLength } from '@/lib/user-text';
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from '@/contracts/admin';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import {
  proposeReferralSchema,
  proposeReferralAcceptanceSchema,
  REFERRAL_NOTE_MAX,
  REFERRAL_ORGANIZATION_MAX,
  REFERRAL_ORGANIZATION_MIN,
  reviewReferralSchema,
  type ReferralCandidates,
  type ReferralPage,
  type ReferralView,
} from '@/contracts/referrals';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Modal,
  Select,
  Textarea,
  useToast,
  ActionBar,
} from '@/components/ui';
import * as actions from '@/server/actions/referrals';
import { AccountFrameView } from '@/components/account/account-frame';
import { useHydrated } from '@/hooks/use-hydrated';

export function ReferralCreate({
  candidates,
  postings,
}: {
  candidates: ReferralCandidates;
  postings: { id: string; title: string; organization: string }[];
}) {
  const t = useTranslations('referrals');
  const formText = useTranslations('formText');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const hydrated = useHydrated();
  const [studentId, setStudent] = useState('');
  const [postingId, setPosting] = useState('');
  const [organizationName, setOrganization] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const fields = useRef<Record<string, HTMLElement | null>>({});
  function focusFirst(errors: Record<string, unknown>) {
    const first = ['studentId', 'organizationName', 'note'].find((key) => errors[key]);
    if (first) fields.current[first]?.focus();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      studentId,
      ...(postingId ? { jobPostingId: postingId } : { organizationName }),
      note,
    };
    const parsed = proposeReferralSchema.safeParse(input);
    if (!parsed.success) {
      const found = Object.fromEntries(
        parsed.error.issues.map((issue) => {
          const key = String(issue.path[0]);
          const message =
            key === 'studentId'
              ? formText('selectStudent')
              : key === 'organizationName'
                ? formText('organization', {
                    min: REFERRAL_ORGANIZATION_MIN,
                    max: REFERRAL_ORGANIZATION_MAX,
                  })
                : key === 'note'
                  ? formText('tooLong', { max: REFERRAL_NOTE_MAX })
                  : errors('VALIDATION_INVALID');
          return [key, message];
        }),
      );
      setFieldErrors(found);
      focusFirst(found);
      return;
    }
    setFieldErrors({});
    setError('');
    start(async () => {
      const result = await safeClientAction(() => actions.proposeReferral(parsed.data));
      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(result.fieldErrors).map(([key, code]) => [
                key,
                key === 'studentId'
                  ? formText('selectStudent')
                  : key === 'organizationName'
                    ? formText('organization', {
                        min: REFERRAL_ORGANIZATION_MIN,
                        max: REFERRAL_ORGANIZATION_MAX,
                      })
                    : key === 'note'
                      ? formText('tooLong', { max: REFERRAL_NOTE_MAX })
                      : errors(code),
              ]),
            ),
          );
          focusFirst(result.fieldErrors);
        } else setError(errors(result.errorCode));
        return;
      }
      router.push('/hesap/referanslar');
      router.refresh();
    });
  }
  return (
    <div data-hydrated={hydrated ? 'true' : undefined} className="w-full max-w-2xl">
      <PageHeader title={t('createTitle')} description={t('createDescription')} />
      {!candidates.students.length ? (
        <div className="mt-8">
          <EmptyState title={t('emptyCandidates')} />
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="mt-8 grid gap-5">
          <Field label={t('student')} error={fieldErrors.studentId} required>
            {(p) => (
              <Select
                {...p}
                ref={(el) => {
                  fields.current.studentId = el;
                }}
                value={studentId}
                onChange={(e) => setStudent(e.target.value)}
              >
                <option value="">{t('choose')}</option>
                {candidates.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.departmentName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {postings.length > 0 && (
            <Field label={t('posting')}>
              {(p) => (
                <Select {...p} value={postingId} onChange={(e) => setPosting(e.target.value)}>
                  <option value="">{t('noPosting')}</option>
                  {postings.map((posting) => (
                    <option key={posting.id} value={posting.id}>
                      {posting.title} · {posting.organization}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!postingId && (
            <Field
              label={t('organization')}
              error={
                fieldErrors.organizationName &&
                userTextLength(organizationName) > REFERRAL_ORGANIZATION_MAX
                  ? t('organizationTooLong', { max: REFERRAL_ORGANIZATION_MAX })
                  : fieldErrors.organizationName
              }
              required
            >
              {(p) => (
                <Input
                  {...p}
                  ref={(el) => {
                    fields.current.organizationName = el;
                  }}
                  autoComplete="organization"
                  value={organizationName}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              )}
            </Field>
          )}
          <Field
            label={t('note')}
            hint={`${t('noteHint')} ${formText('counter', { count: userTextLength(note), max: REFERRAL_NOTE_MAX })}`}
            error={fieldErrors.note}
          >
            {(p) => (
              <Textarea
                {...p}
                ref={(el) => {
                  fields.current.note = el;
                }}
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
          <ActionBar className="bg-bg pb-4 pt-3 lg:sticky lg:bottom-0">
            <Button type="submit" fullWidth loading={pending}>
              {t('send')}
            </Button>
          </ActionBar>
        </form>
      )}
    </div>
  );
}

const CREATE_LINK =
  'mt-5 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-semibold text-on-primary';

export function ReferralList({
  initial,
  userId,
  moderation = false,
  canCreate = false,
  canReceive = false,
}: {
  initial: ReferralPage;
  userId: string;
  moderation?: boolean;
  /** Referans beyanını başlatabilen rol (doğrulanmış mezun). */
  canCreate?: boolean;
  /** Referans gösterilebilen rol (doğrulanmış öğrenci): boşken "neden yok" cümlesi onun içindir. */
  canReceive?: boolean;
}) {
  const { rootRef: queueRef, complete: completeDecision } = useQueueFocus();
  const reviewReasonInput = useRef<HTMLTextAreaElement>(null);
  const t = useTranslations('referrals');
  const formText = useTranslations('formText');
  const errors = useTranslations('errors.codes');
  const frame = useTranslations('accountFrame');
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const [cancelChoice, setCancelChoice] = useState<ReferralView>();
  const [reviewChoice, setReviewChoice] = useState<{
    row: ReferralView;
    operation: 'CONFIRM' | 'REJECT';
  }>();
  const [page, setPage] = useState(initial);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const noteInputs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function perform(row: ReferralView, operation: 'CONFIRM' | 'REJECT' | 'ACCEPTANCE' | 'CANCEL') {
    if (operation === 'ACCEPTANCE') {
      const parsed = proposeReferralAcceptanceSchema.safeParse({
        referralId: row.id,
        note: note[row.id] ?? '',
      });
      if (!parsed.success) {
        setNoteErrors((previous) => ({
          ...previous,
          [row.id]: formText('tooLong', { max: REFERRAL_NOTE_MAX }),
        }));
        noteInputs.current[row.id]?.focus();
        return;
      }
      setNoteErrors((previous) => ({ ...previous, [row.id]: '' }));
    }
    if (moderation && operation === 'REJECT') {
      const parsed = reviewReferralSchema.safeParse({
        referralId: row.id,
        stage: row.status === 'STUDENT_CONFIRMED' ? 'REFERRAL' : 'ACCEPTANCE',
        decision: 'REJECT',
        reason: reason[row.id] ?? '',
      });
      if (!parsed.success) {
        setReasonErrors((previous) => ({
          ...previous,
          [row.id]: errors(
            userTextLength(reason[row.id] ?? '') < ADMIN_REASON_MIN
              ? 'AUDIT_REASON_REQUIRED'
              : 'AUDIT_REASON_INVALID',
          ),
        }));
        reviewReasonInput.current?.focus();
        return;
      }
    }
    setReasonErrors((previous) => ({ ...previous, [row.id]: '' }));
    start(async () => {
      setError('');
      const result = moderation
        ? await safeClientAction(() =>
            actions.reviewReferral({
              referralId: row.id,
              stage: row.status === 'STUDENT_CONFIRMED' ? 'REFERRAL' : 'ACCEPTANCE',
              decision: operation === 'CONFIRM' ? 'APPROVE' : 'REJECT',
              ...(operation === 'REJECT' ? { reason: reason[row.id] ?? '' } : {}),
            }),
          )
        : operation === 'ACCEPTANCE'
          ? await safeClientAction(() =>
              actions.proposeReferralAcceptance({
                referralId: row.id,
                note: note[row.id] ?? '',
              }),
            )
          : operation === 'CANCEL'
            ? await safeClientAction(() => actions.cancelReferral({ referralId: row.id }))
            : row.student.id === userId
              ? await safeClientAction(() =>
                  actions.respondReferral({ referralId: row.id, decision: operation }),
                )
              : await safeClientAction(() =>
                  actions.respondReferralAcceptance({
                    referralId: row.id,
                    decision: operation,
                  }),
                );
      if (!result.ok) {
        if (operation === 'ACCEPTANCE' && result.fieldErrors?.note) {
          setNoteErrors((previous) => ({
            ...previous,
            [row.id]: formText('tooLong', { max: REFERRAL_NOTE_MAX }),
          }));
          noteInputs.current[row.id]?.focus();
        } else if (moderation && result.fieldErrors?.reason) {
          setReasonErrors((previous) => ({
            ...previous,
            [row.id]: errors(result.fieldErrors!.reason!),
          }));
          reviewReasonInput.current?.focus();
        } else setError(errors(result.errorCode));
        return;
      }
      if (moderation) {
        completeDecision(row.id);
        // Karar satırı kuyruktan kalkar; yönetici sonucu görünür bildirimle görür.
        toast.show({
          message: t(operation === 'REJECT' ? 'moderationRejected' : 'moderationApproved'),
          tone: 'success',
        });
      }
      setCancelChoice(undefined);
      setReviewChoice(undefined);
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
        ? await safeClientAction(() => actions.listReferralModeration(input))
        : await safeClientAction(() => actions.listMyReferrals(input));
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
  const Rows = moderation ? AdminList : 'ul';
  const Row = moderation ? AdminListItem : 'li';
  // Hesap çerçevesi başlığı tek kez çizer; moderasyon kendi başlığını ve yönetim satırlarını korur.
  const body = (
    <div
      ref={queueRef}
      data-hydrated={hydrated ? 'true' : undefined}
      className={moderation ? 'min-w-0 space-y-6' : 'w-full [&>:first-child]:mt-0'}
    >
      {moderation && (
        <PageHeader title={t('moderationTitle')} description={t('moderationDescription')} />
      )}
      {canCreate && page.items.length > 0 && (
        <Link href="/referans/yeni" className={CREATE_LINK}>
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
          {/* Boşken tek eylem: başlatabilen rol için düğme burada; öğrenci ve diğerleri için eylem yok, nedeni yazılı. */}
          <EmptyState
            title={t(
              moderation
                ? 'empty'
                : canCreate
                  ? 'emptyAlumni'
                  : canReceive
                    ? 'emptyStudent'
                    : 'emptyOther',
            )}
            description={t(
              moderation
                ? 'emptyModerationDescription'
                : canCreate
                  ? 'emptyAlumniDescription'
                  : canReceive
                    ? 'emptyStudentDescription'
                    : 'emptyOtherDescription',
            )}
            action={
              canCreate && !moderation ? (
                <Link href="/referans/yeni" className={CREATE_LINK}>
                  {t('create')}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Rows className={moderation ? undefined : 'mt-7 grid gap-4'}>
          {page.items.map((row) => {
            const student = row.student.id === userId;
            const alumni = row.alumnus.id === userId;
            const canRespond =
              moderation ||
              (student && row.status === 'PROPOSED') ||
              (alumni && row.status === 'ACCEPTED_PROPOSED');
            return (
              <Row
                data-queue-row={row.id}
                key={row.id}
                className={
                  moderation
                    ? undefined
                    : 'min-w-0 rounded-card border border-border bg-surface p-5 shadow-card'
                }
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
                {student && row.status === 'APPROVED' && (
                  <div className="mt-4">
                    <Field
                      label={t('acceptanceNote')}
                      hint={`${t('noteHint')} ${formText('counter', { count: userTextLength(note[row.id] ?? ''), max: REFERRAL_NOTE_MAX })}`}
                      error={noteErrors[row.id] || undefined}
                    >
                      {(p) => (
                        <Textarea
                          {...p}
                          value={note[row.id] ?? ''}
                          ref={(element) => {
                            noteInputs.current[row.id] = element;
                          }}
                          onChange={(e) => {
                            setNote({ ...note, [row.id]: e.target.value });
                            setNoteErrors((previous) => ({ ...previous, [row.id]: '' }));
                          }}
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
                    <Button
                      data-queue-action
                      loading={pending}
                      onClick={() =>
                        moderation
                          ? setReviewChoice({ row, operation: 'CONFIRM' })
                          : perform(row, 'CONFIRM')
                      }
                    >
                      {t('approve')}
                    </Button>
                    <Button
                      variant="secondary"
                      loading={pending}
                      onClick={() =>
                        moderation
                          ? setReviewChoice({ row, operation: 'REJECT' })
                          : perform(row, 'REJECT')
                      }
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
                        onClick={() => setCancelChoice(row)}
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
              </Row>
            );
          })}
        </Rows>
      )}
      <Modal
        open={!!reviewChoice}
        onClose={() => setReviewChoice(undefined)}
        title={t(reviewChoice?.operation === 'REJECT' ? 'reject' : 'approve')}
        description={t(
          reviewChoice?.operation === 'REJECT' ? 'reviewRejectConfirm' : 'reviewApproveConfirm',
        )}
        footer={
          <>
            <Button
              variant={reviewChoice?.operation === 'REJECT' ? 'danger' : 'primary'}
              loading={pending}
              onClick={() => {
                if (reviewChoice) perform(reviewChoice.row, reviewChoice.operation);
              }}
            >
              {t(reviewChoice?.operation === 'REJECT' ? 'reject' : 'approve')}
            </Button>
            <Button variant="secondary" onClick={() => setReviewChoice(undefined)}>
              {t('goBack')}
            </Button>
          </>
        }
      >
        {reviewChoice?.operation === 'REJECT' && (
          <Field
            label={t('reason')}
            hint={`${t('reasonHint')} ${formText('counter', { count: userTextLength(reason[reviewChoice.row.id] ?? ''), max: ADMIN_REASON_MAX })}`}
            error={reasonErrors[reviewChoice.row.id]}
            required
          >
            {(p) => (
              <Textarea
                {...p}
                ref={reviewReasonInput}
                value={reason[reviewChoice.row.id] ?? ''}
                onChange={(e) => {
                  setReason({ ...reason, [reviewChoice.row.id]: e.target.value });
                  setReasonErrors((previous) => ({ ...previous, [reviewChoice.row.id]: '' }));
                }}
              />
            )}
          </Field>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Modal>
      <Modal
        open={!!cancelChoice}
        onClose={() => setCancelChoice(undefined)}
        title={t('cancel')}
        description={t('cancelConfirm')}
        footer={
          <>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                if (cancelChoice) perform(cancelChoice, 'CANCEL');
              }}
            >
              {t('cancel')}
            </Button>
            <Button variant="secondary" onClick={() => setCancelChoice(undefined)}>
              {t('goBack')}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Modal>
      {page.nextCursor && (
        <div className="mt-5">
          <Button variant="secondary" loading={pending} onClick={more}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
  if (moderation) return body;
  return (
    <AccountFrameView
      eyebrow={frame('eyebrow')}
      backLabel={frame('back')}
      title={t('title')}
      description={t('description')}
      width="max-w-3xl"
    >
      {body}
    </AccountFrameView>
  );
}
