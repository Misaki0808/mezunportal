'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ADMIN_REASON_MIN } from '@/contracts/admin';
import {
  awardCycleInputSchema,
  configureAwardCycleSchema,
  recalculateAwardCycleSchema,
  selectYearAlumnusSchema,
  type AwardCycleView,
} from '@/contracts/year-alumni';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  cn,
  useAction,
} from '@/components/ui';
import { awardFreezeAt } from '@/server/rules/yearAlumni';
import {
  configureAwardCycle,
  listAwardCandidates,
  recalculateAwardCycle,
  selectYearAlumnus,
} from '@/server/actions/year-alumni';

type Operation = 'load' | 'configure' | 'recalculate' | 'choose';

/**
 * Yılın Mezunu yönetimi. Geri bildirim tek kalıptadır (kart 207): başarı toast, hata `role="alert"`, gönderim sürerken düğme
 * bekler. Karar penceresi her açılışta temiz başlar (önceki işlemin mesajı sızmaz); tören tarihi sebebi tarih alanının altındadır.
 */
export function AwardAdmin({ departments }: { departments: { id: string; name: string }[] }) {
  const t = useTranslations('yearAlumni');
  const pointLabels = useTranslations('points.actions');
  const action = useAction();
  const hintId = useId();
  const disabled = (condition: boolean, reason: string) =>
    condition ? { disabled: true as const, disabledReason: reason } : { disabled: false as const };
  const [departmentId, setDepartment] = useState(departments[0]?.id ?? '');
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [ceremonyDate, setCeremony] = useState('');
  const [recalcReason, setRecalcReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [cycle, setCycle] = useState<AwardCycleView | null>(null);
  const [missed, setMissed] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  // Sayfa düzeyi geri bildirim: bilgi (dönem yok), form hatası ve alan sebepleri. Sunucu hatası `action.error`'dadır.
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [ceremonyError, setCeremonyError] = useState<string>();
  const [recalcError, setRecalcError] = useState<string>();
  const [decisionError, setDecisionError] = useState<string>();
  const input = { departmentId, year };
  const loading = (name: Operation) => action.busy && operation === name;

  function resetFeedback() {
    action.clear();
    setNotice('');
    setFormError('');
    setCeremonyError(undefined);
    setRecalcError(undefined);
    setDecisionError(undefined);
  }
  function start(name: Operation) {
    if (action.busy) return false;
    resetFeedback();
    setOperation(name);
    return true;
  }
  function clearCycle() {
    setCycle(null);
    setMissed(false);
    resetFeedback();
  }

  async function load() {
    if (!start('load')) return;
    if (!awardCycleInputSchema.safeParse(input).success) {
      setFormError(t('invalid'));
      return;
    }
    await action.run(() => listAwardCandidates(input), {
      onOk: (data) => {
        setMissed(false);
        setCycle(data);
      },
      onFailure: (failure) => {
        setCycle(null);
        setMissed(failure.errorCode === 'AWARD_FREEZE_MISSED');
        if (failure.errorCode === 'RESOURCE_NOT_FOUND') {
          setNotice(t('noCycle'));
          action.clear();
        }
      },
    });
  }

  async function configure() {
    if (!start('configure')) return;
    const parsed = configureAwardCycleSchema.safeParse({ ...input, ceremonyDate });
    if (!parsed.success) {
      const onlyDate = parsed.error.issues.every((issue) => issue.path[0] === 'ceremonyDate');
      if (onlyDate) setCeremonyError(t('ceremonyRequired'));
      else setFormError(t('invalid'));
      return;
    }
    // Sunucuyla aynı kural: liste törenden 30 gün önce donar; bu an geçmişse tarih kabul edilmez.
    if (awardFreezeAt(parsed.data.ceremonyDate).getTime() <= Date.now()) {
      setCeremonyError(t('ceremonyTooSoon'));
      return;
    }
    await action.run(() => configureAwardCycle(parsed.data), {
      success: t('ceremonySaved'),
      onOk: (data) => {
        setCycle(data);
        setMissed(false);
      },
      onFailure: (failure) => {
        // Sunucu da tarihi reddedebilir (dönem zaten donmuş): sebep tarih alanının altında, genel mesaj değil.
        if (failure.errorCode === 'VALIDATION_INVALID') {
          setCeremonyError(t('ceremonyRejected'));
          action.clear();
        }
      },
    });
  }

  async function recalculate() {
    if (!start('recalculate')) return;
    const parsed = recalculateAwardCycleSchema.safeParse({ ...input, reason: recalcReason });
    if (!parsed.success) {
      setRecalcError(t('reasonRequired', { min: ADMIN_REASON_MIN }));
      return;
    }
    await action.run(() => recalculateAwardCycle(parsed.data), {
      success: t('recalculated'),
      onOk: (data) => {
        setCycle(data);
        setRecalcReason('');
        setMissed(false);
      },
    });
  }

  function openChoice(userId: string) {
    resetFeedback();
    setDecisionReason('');
    setSelected(userId);
  }
  function closeChoice() {
    setSelected(null);
    resetFeedback();
  }
  async function choose() {
    if (!selected || action.busy) return;
    action.clear();
    setDecisionError(undefined);
    setOperation('choose');
    const parsed = selectYearAlumnusSchema.safeParse({
      ...input,
      userId: selected,
      reason: decisionReason,
    });
    if (!parsed.success) {
      setDecisionError(t('reasonRequired', { min: ADMIN_REASON_MIN }));
      return;
    }
    const name = cycle?.candidates.find((candidate) => candidate.userId === selected)?.name;
    await action.run(() => selectYearAlumnus(parsed.data), {
      success: name ? t('selectedNamed', { name }) : t('selected'),
      onOk: async () => {
        setSelected(null);
        setDecisionReason('');
        // Yenileme başarısız olsa da seçilen kişi ekranda hemen görünür (düğmeler kilitlenir, kart rozet alır).
        setCycle((current) =>
          current ? { ...current, selectedUserId: parsed.data.userId } : current,
        );
        const refreshed = await safeClientAction(() => listAwardCandidates(input));
        if (refreshed.ok) setCycle(refreshed.data);
      },
    });
  }

  const selectedUserId = cycle?.selectedUserId ?? null;
  const choiceBlocked = !!cycle && (!cycle.frozenAt || !!selectedUserId);
  const pageError = selected ? '' : formError || action.error || '';
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-10">
      <PageHeader title={t('adminTitle')} description={t('adminIntro')} />
      <Card className="space-y-4 p-5">
        <Field label={t('selectDepartment')}>
          {(props) => (
            <Select
              {...props}
              value={departmentId}
              onChange={(e) => {
                setDepartment(e.target.value);
                clearCycle();
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('year')}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                clearCycle();
              }}
            />
          )}
        </Field>
        <Button
          {...disabled(!departmentId, t('noDepartments'))}
          loading={loading('load')}
          onClick={() => void load()}
        >
          {t('load')}
        </Button>
        <Field label={t('ceremony')} hint={t('freezeInfo')} error={ceremonyError}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={ceremonyDate}
              onChange={(e) => {
                setCeremony(e.target.value);
                setCeremonyError(undefined);
              }}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          {...disabled(!departmentId, t('noDepartments'))}
          loading={loading('configure')}
          onClick={() => void configure()}
        >
          {t('configure')}
        </Button>
      </Card>
      {notice && (
        <p role="status" className="text-fg">
          {notice}
        </p>
      )}
      {pageError && (
        <p role="alert" className="text-danger">
          {pageError}
        </p>
      )}
      {missed && (
        <Card className="space-y-3 p-5">
          <Field label={t('recalculateReason')} error={recalcError}>
            {(props) => (
              <Textarea
                {...props}
                value={recalcReason}
                onChange={(e) => {
                  setRecalcReason(e.target.value);
                  setRecalcError(undefined);
                }}
              />
            )}
          </Field>
          <Button
            variant="secondary"
            loading={loading('recalculate')}
            onClick={() => void recalculate()}
          >
            {t('recalculate')}
          </Button>
        </Card>
      )}
      {cycle && (
        <>
          <Card className="space-y-3 p-5">
            <p className="font-semibold">{cycle.frozenAt ? t('frozen') : t('live')}</p>
            {/* Seçim kilitliyken sebep BİR yerde: aday kartlarındaki kapalı düğmeler buna bağlanır (kartlarda tekrarlanmaz). */}
            {choiceBlocked && (
              <p id={hintId} className="text-fg-muted">
                {selectedUserId ? t('alreadySelected') : t('freezeInfo')}
              </p>
            )}
            {cycle.selectedNeedsReview && (
              <p role="alert" className="text-danger">
                {t('awardNeedsReview')}
              </p>
            )}
            <p>{t('excluded', { count: cycle.excludedForSuspicion })}</p>
            {cycle.frozenAt && (
              <>
                <Field label={t('recalculateReason')} error={recalcError}>
                  {(props) => (
                    <Textarea
                      {...props}
                      value={recalcReason}
                      onChange={(e) => {
                        setRecalcReason(e.target.value);
                        setRecalcError(undefined);
                      }}
                    />
                  )}
                </Field>
                <Button
                  variant="secondary"
                  loading={loading('recalculate')}
                  onClick={() => void recalculate()}
                >
                  {t('recalculate')}
                </Button>
              </>
            )}
          </Card>
          <ul className="space-y-3">
            {cycle.candidates.map((candidate) => {
              const winner = candidate.userId === selectedUserId;
              return (
                <li key={candidate.userId}>
                  <Card className={cn('space-y-2 p-5', winner && 'border-success')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{candidate.name}</h2>
                      {winner && <Badge tone="success">{t('winnerBadge')}</Badge>}
                    </div>
                    <p>
                      {t('points', { count: candidate.points })} ·{' '}
                      {t('experiences', { count: candidate.experienceCount })} ·{' '}
                      {t('meetings', { count: candidate.meetingCount })}
                    </p>
                    <ul>
                      {candidate.breakdown.map((item) => (
                        <li key={item.action}>
                          {pointLabels(item.action)}: {item.points}
                        </li>
                      ))}
                    </ul>
                    {!winner && (
                      <Button
                        variant="secondary"
                        {...(choiceBlocked
                          ? ({ disabled: true, disabledReasonId: hintId } as const)
                          : { disabled: false as const })}
                        onClick={() => openChoice(candidate.userId)}
                      >
                        {t('choose')}
                      </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          {cycle.candidates.length === 0 && <p>{t('noCandidates')}</p>}
        </>
      )}
      <Modal
        open={!!selected}
        onClose={closeChoice}
        title={t('confirm')}
        description={t('confirmText')}
        footer={
          <>
            <Button variant="secondary" onClick={closeChoice}>
              {t('cancel')}
            </Button>
            <Button loading={loading('choose')} onClick={() => void choose()}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('reason')} error={decisionError}>
          {(props) => (
            <Textarea
              {...props}
              value={decisionReason}
              onChange={(e) => {
                setDecisionReason(e.target.value);
                setDecisionError(undefined);
              }}
            />
          )}
        </Field>
        {action.error && (
          <p role="alert" className="text-danger">
            {action.error}
          </p>
        )}
      </Modal>
    </div>
  );
}
