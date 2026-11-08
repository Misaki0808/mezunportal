'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  correctMembershipSchema,
  suspendUserSchema,
  unsuspendUserSchema,
  type AdminUserDetail as UserDetail,
  type CorrectMembershipInput,
  type CorrectMembershipOutput,
  type SuspendUserInput,
  type SuspendUserOutput,
  type UnsuspendUserInput,
  type UnsuspendUserOutput,
} from '@/contracts/admin-users';
import type { AdminOverview } from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';

type Props = {
  initial: UserDetail;
  departments: AdminOverview['departments'];
  suspend: (input: SuspendUserInput) => Promise<ActionResult<SuspendUserOutput>>;
  unsuspend: (input: UnsuspendUserInput) => Promise<ActionResult<UnsuspendUserOutput>>;
  correct: (input: CorrectMembershipInput) => Promise<ActionResult<CorrectMembershipOutput>>;
};
type Membership = UserDetail['memberships'][number];
type Choice = { kind: 'suspend' | 'unsuspend' } | { kind: 'correct'; membership: Membership };
export function AdminUserDetail({ initial, departments, suspend, unsuspend, correct }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>();
  const [reason, setReason] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<Membership['role']>('STUDENT');
  const [entryYear, setEntryYear] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  function close() {
    if (pending) return;
    setChoice(undefined);
    setReason('');
    setInvalid(false);
    setError(undefined);
  }
  function beginCorrection(membership: Membership) {
    setDepartment(membership.departmentId);
    setRole(membership.role);
    setEntryYear(membership.entryYear?.toString() ?? '');
    setGraduationYear(membership.graduationYear?.toString() ?? '');
    setChoice({ kind: 'correct', membership });
  }
  async function submit() {
    if (!choice || pending) return;
    let operation: (() => Promise<ActionResult<unknown>>) | undefined;
    if (choice.kind === 'correct') {
      const m = choice.membership;
      const changes = {
        ...(department !== m.departmentId ? { departmentId: department } : {}),
        ...(role !== m.role ? { role } : {}),
        ...(entryYear !== (m.entryYear?.toString() ?? '')
          ? { entryYear: entryYear ? Number(entryYear) : null }
          : {}),
        ...(graduationYear !== (m.graduationYear?.toString() ?? '')
          ? { graduationYear: graduationYear ? Number(graduationYear) : null }
          : {}),
      };
      const result = correctMembershipSchema.safeParse({
        membershipId: m.id,
        changes,
        reason,
        confirmed: true,
      });
      if (result.success) operation = () => correct(result.data);
    } else if (choice.kind === 'suspend') {
      const result = suspendUserSchema.safeParse({ userId: initial.id, reason, confirmed: true });
      if (result.success) operation = () => suspend(result.data);
    } else {
      const result = unsuspendUserSchema.safeParse({ userId: initial.id, reason, confirmed: true });
      if (result.success) operation = () => unsuspend(result.data);
    }
    if (!operation) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setInvalid(false);
    setError(undefined);
    try {
      const result = await operation();
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setNotice(
        choice.kind === 'correct'
          ? t('users.correctSuccess')
          : choice.kind === 'suspend'
            ? t('users.suspended')
            : t('users.unsuspended'),
      );
      setChoice(undefined);
      setReason('');
      router.refresh();
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  const roleName = (value: Membership['role']) =>
    t(
      `users.${value === 'STUDENT' ? 'roleStudent' : value === 'ALUMNI' ? 'roleAlumni' : 'roleAcademic'}`,
    );
  return (
    <AdminFrame title={t('users.detail')}>
      <section className="rounded-card border border-border p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{initial.displayName}</h2>
          <Badge tone={initial.status === 'SUSPENDED' ? 'danger' : 'success'}>
            {initial.status === 'SUSPENDED' ? t('inactive') : t('active')}
          </Badge>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">{t('maskedEmail')}</dt>
            <dd className="break-all">{initial.maskedEmail}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t('maskedPhone')}</dt>
            <dd>{initial.maskedPhone ?? t('none')}</dd>
          </div>
        </dl>
        {notice && (
          <p role="status" className="mt-4 text-on-success-soft">
            {notice}
          </p>
        )}
        <div className="mt-5">
          {initial.manageable ? (
            <Button
              variant="secondary"
              className="border-danger text-danger"
              onClick={() =>
                setChoice({ kind: initial.status === 'SUSPENDED' ? 'unsuspend' : 'suspend' })
              }
            >
              {initial.status === 'SUSPENDED' ? t('users.unsuspend') : t('users.suspend')}
            </Button>
          ) : (
            <p className="text-fg-muted">{t('users.unmanageable')}</p>
          )}
        </div>
      </section>
      <section className="mt-7">
        <h2 className="text-xl font-semibold">{t('users.memberships')}</h2>
        <ul className="mt-4 grid gap-3">
          {initial.memberships.map((m) => (
            <li key={m.id} className="rounded-card border border-border p-5">
              <h3 className="text-lg font-semibold">{m.departmentName}</h3>
              <p className="mt-1">
                {roleName(m.role)} ·{' '}
                {m.active ? t('users.membershipActive') : t('users.membershipClosed')}
              </p>
              <p className="mt-1 text-fg-muted">
                {t(
                  `users.${m.verificationStatus === 'VERIFIED' ? 'verificationVerified' : m.verificationStatus === 'PENDING' ? 'verificationPending' : 'verificationRejected'}`,
                )}
                {!m.inScope && ` · ${t('users.scopeOutside')}`}
              </p>
              {initial.manageable && m.active && m.inScope && (
                <Button variant="secondary" className="mt-4" onClick={() => beginCorrection(m)}>
                  {t('users.correction')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <Modal
        open={choice !== undefined}
        onClose={close}
        title={
          choice?.kind === 'suspend'
            ? t('users.suspendTitle')
            : choice?.kind === 'unsuspend'
              ? t('users.unsuspendTitle')
              : t('users.correctionTitle')
        }
        description={
          choice?.kind === 'suspend'
            ? t('users.suspendDescription')
            : choice?.kind === 'unsuspend'
              ? t('users.unsuspendDescription')
              : t('users.correctionDescription')
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant="secondary"
              className="border-danger text-danger"
              loading={pending}
              onClick={() => void submit()}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        {choice?.kind === 'correct' && (
          <div className="mb-5 flex flex-col gap-4">
            <Field label={t('department')}>
              {(props) => (
                <Select
                  {...props}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.facultyName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('role')}>
              {(props) => (
                <Select
                  {...props}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Membership['role'])}
                >
                  {(['STUDENT', 'ALUMNI', 'ACADEMIC'] as const).map((r) => (
                    <option value={r} key={r}>
                      {roleName(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('users.entryYear')}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={1950}
                  max={2100}
                  value={entryYear}
                  onChange={(e) => setEntryYear(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('users.graduationYear')}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={1950}
                  max={2100}
                  value={graduationYear}
                  onChange={(e) => setGraduationYear(e.target.value)}
                />
              )}
            </Field>
          </div>
        )}
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={invalid && reason.trim().length < 3 ? t('reasonInvalid') : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
            />
          )}
        </Field>
        {invalid && reason.trim().length >= 3 && (
          <p role="alert" className="mt-3 text-danger">
            {t('invalid')}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </AdminFrame>
  );
}
