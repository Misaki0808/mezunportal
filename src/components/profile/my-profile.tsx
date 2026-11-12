'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';

import type { CvSection } from '@/contracts/cv';
import {
  PROFILE_SKILL_LIMIT,
  SKILLS_MIN_FOR_COMPLETION,
  SOCIAL_LINK_KINDS,
  PROFILE_TEXT_LIMITS,
  normalizeLinkedinUrl,
  normalizeSocialLink,
  type AddProfileSkillInput,
  type DeleteProfileEntryInput,
  type MyProfile as MyProfileData,
  type ProfileEntrySection,
  type RemoveProfileSkillInput,
  type SaveProfileEntryInput,
  type SetLinkedinUrlInput,
  type SetSocialLinksInput,
  type SkillSuggestions,
  type SocialLinkKind,
  type SuggestSkillsInput,
  type UpdateProfileBasicsInput,
} from '@/contracts/profile-content';
import type { ActionResult } from '@/contracts/result';
import {
  Badge,
  Button,
  buttonClasses,
  ChevronDownIcon,
  ChevronRightIcon,
  cn,
  Field,
  Input,
  Modal,
  Select,
  Sheet,
  Textarea,
  useAction,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { EntryEditor } from './entry-editor';
import { EntrySummary } from './entry-summary';
import { pickNextStep, type NextStep } from './next-step';

type Values = Record<string, unknown>;
type Result = Promise<ActionResult<MyProfileData>>;

export type MyProfileActions = {
  updateBasics: (input: UpdateProfileBasicsInput) => Result;
  setSocialLinks: (input: SetSocialLinksInput) => Result;
  setLinkedinUrl: (input: SetLinkedinUrlInput) => Result;
  saveEntry: (input: SaveProfileEntryInput) => Result;
  deleteEntry: (input: DeleteProfileEntryInput) => Result;
  addSkill: (input: AddProfileSkillInput) => Result;
  removeSkill: (input: RemoveProfileSkillInput) => Result;
  suggestSkills: (input: SuggestSkillsInput) => Promise<ActionResult<SkillSuggestions>>;
};

type Props = {
  initial: MyProfileData;
  actions: MyProfileActions;
  /** Tamamlanma kartından ÖNCE, ilk ekranda görünen ek bölüm (katkı puanı özeti: P1-16 kararı). */
  beforeCompletion?: ReactNode;
  /** Bilgi bölümlerinin ALTINDA görünen ek bölümler (ör. hedefe yakınlık karşılaştırması). */
  afterSections?: ReactNode;
};

const ENTRY_SECTIONS: readonly {
  section: ProfileEntrySection;
  key: 'education' | 'positions' | 'languages' | 'certifications';
}[] = [
  { section: 'EDUCATION', key: 'education' },
  { section: 'POSITION', key: 'positions' },
  { section: 'LANGUAGE', key: 'languages' },
  { section: 'CERTIFICATION', key: 'certifications' },
];

type Editing =
  | { kind: 'basics' }
  | { kind: 'entry'; section: ProfileEntrySection; id?: string; values?: Values }
  | { kind: 'links' };

/** Kendi profilim: bölüm bölüm görüntüle + alt sayfada düzenle. Her eylem güncel profili döner; ekran onu çizer. */
export function MyProfile({ initial, actions, beforeCompletion, afterSections }: Props) {
  const router = useRouter();
  const action = useAction();
  const t = useTranslations('profile.my');
  const sections = useTranslations('profile.sections');
  const errors = useTranslations('errors.codes');
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState<Editing>();
  const [deleting, setDeleting] = useState<{ section: ProfileEntrySection; id: string }>();
  const [error, setError] = useState<ErrorCode>();
  const pending = action.busy;
  const editFormId = useId();
  // Bilgi bölümleri varsayılan KAPALI: ilk ekranda tamamlanma ve sıradaki adım görünür; ayrıntı isteğe bağlı açılır.
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());
  const [othersOpen, setOthersOpen] = useState(false);
  const othersId = useId();
  const toggle = (id: string) =>
    setOpenSections((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const reveal = (id: string) => setOpenSections((current) => new Set(current).add(id));

  /** Eylemi çalıştırır; başarıda profili günceller. Alan/sunucu hatası çağırana `false` + kodla döner. */
  async function run(operation: () => Result, after?: () => void): Promise<ErrorCode | null> {
    let failure: ErrorCode | null = null;
    setError(undefined);
    await action.run(operation, {
      success: t('saved'),
      onOk: (data) => {
        setProfile(data);
        after?.();
      },
      onFailure: (result) => {
        failure = result.errorCode;
        setError(result.errorCode);
      },
    });
    return failure;
  }

  // Sanal klavye görünür alanı daralttığında odaklı kontrolü sayfanın kaydırılabilir kısmında tut.
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.matches('input, textarea, select') &&
          active.closest('dialog[open]')
        ) {
          active.scrollIntoView?.({ block: 'nearest' });
        }
      });
    };
    window.addEventListener('resize', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    document.addEventListener('focusin', reveal);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
      document.removeEventListener('focusin', reveal);
    };
  }, [editing]);

  const editorFooter = (
    <>
      <Button type="submit" form={editFormId} size="lg" fullWidth loading={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
      <Button variant="secondary" fullWidth onClick={() => setEditing(undefined)}>
        {t('cancel')}
      </Button>
    </>
  );

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(value)) : null;
  const percent = profile.completion.percent;
  const missing = profile.completion.missing;
  const label = (field: string) =>
    field === 'SKILLS'
      ? t('missing.SKILLS', { min: SKILLS_MIN_FOR_COMPLETION })
      : t(`missing.${field as 'CV'}`);

  const entries = (key: (typeof ENTRY_SECTIONS)[number]['key']) =>
    profile[key] as ({ id: string; source: 'CV' | 'MANUAL'; manuallyEdited: boolean } & Values)[];

  const nextStep = pickNextStep(missing);
  const otherMissing = missing.filter((field) => field !== nextStep?.field);
  function openNextStep(step: NextStep) {
    if (step.target.kind === 'basics') setEditing({ kind: 'basics' });
    else if (step.target.kind === 'education') setEditing({ kind: 'entry', section: 'EDUCATION' });
    else if (step.target.kind === 'skills') {
      reveal('skills');
      requestAnimationFrame(() =>
        document.getElementById('profile-skills')?.scrollIntoView?.({ block: 'start' }),
      );
    }
  }
  const nextRowClasses =
    'press-row flex min-h-14 w-full items-center justify-between gap-3 rounded-control border border-border-control bg-bg px-4 py-3 text-left text-base font-medium text-fg';
  const linkCount = (profile.linkedinUrl ? 1 : 0) + profile.socialLinks.length;
  const metaOf = (count: number, filled: string) => (count > 0 ? filled : t('metaEmpty'));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pb-10 pt-10 [overflow-wrap:anywhere] sm:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-base font-semibold text-primary">
            {t('title').toLocaleUpperCase('tr-TR')}
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-fg">
            {profile.displayName}
          </h1>
          {profile.headline && <p className="mt-1 text-lg text-fg">{profile.headline}</p>}
          <p className="mt-2 text-base text-fg-muted">{t('description')}</p>
          <p className="mt-1 text-sm text-fg-muted">
            {date(profile.lastUpdatedAt)
              ? t('updated', { date: date(profile.lastUpdatedAt)! })
              : t('neverUpdated')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setEditing({ kind: 'basics' })}>
          {t('editShortcut')}
        </Button>
      </header>

      {/* Çekmece açıkken hata çekmecenin İÇİNDE (serverError) gösterilir; arkadaki sayfada yinelenmez. */}
      {error && !editing && (
        <div role="alert" className="text-base text-danger">
          {errors(error)}
        </div>
      )}

      {beforeCompletion}

      <section aria-labelledby="completion" className="rounded-card border border-border p-4">
        <h2 id="completion" className="text-lg font-semibold text-fg">
          {t('completion', { percent })}
        </h2>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-labelledby="completion"
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {nextStep && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-fg-muted">{t('nextStep')}</p>
            {nextStep.target.kind === 'link' ? (
              <Link href={nextStep.target.href} className={nextRowClasses}>
                {label(nextStep.field)}
                <ChevronRightIcon aria-hidden="true" className="shrink-0 text-primary" />
              </Link>
            ) : (
              <button
                type="button"
                className={nextRowClasses}
                onClick={() => openNextStep(nextStep)}
              >
                {label(nextStep.field)}
                <ChevronRightIcon aria-hidden="true" className="shrink-0 text-primary" />
              </button>
            )}
          </div>
        )}
        {otherMissing.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={othersOpen}
              aria-controls={othersId}
              onClick={() => setOthersOpen((value) => !value)}
              className="press-row inline-flex min-h-11 items-center gap-1 text-base font-medium text-primary"
            >
              {t('othersMissing', { count: otherMissing.length })}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn('shrink-0 transition-transform', othersOpen && 'rotate-180')}
              />
            </button>
            <ul
              id={othersId}
              hidden={!othersOpen}
              className="mt-1 list-disc space-y-1 pl-5 text-base text-fg"
            >
              {otherMissing.map((field) => (
                <li key={field}>{label(field)}</li>
              ))}
            </ul>
          </div>
        )}
        {/* İlgi alanı, hedef, mentorluk ve gizlilik adımları tamamlansa da buradan yeniden açılır. */}
        <Link
          className={buttonClasses({ variant: 'ghost' }) + ' mt-1 -ml-4'}
          href="/baslangic?duzenle=1"
        >
          {t('onboardingLink')}
        </Link>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-primary bg-primary-soft p-4 text-on-primary-soft">
        <h2 className="text-lg font-semibold">{t('cvTitle')}</h2>
        <p className="text-base">{t('cvDescription')}</p>
        <Link className={buttonClasses({ fullWidth: true })} href="/profil/cv">
          {t('cvAction')}
        </Link>
      </section>

      <div className="flex flex-col gap-3">
        <Block
          id="basics"
          title={t('basics')}
          meta={metaOf(
            profile.summary || profile.city || profile.goals ? 1 : 0,
            profile.city || t('metaFilled'),
          )}
          open={openSections.has('basics')}
          onToggle={() => toggle('basics')}
          action={
            <Button variant="secondary" onClick={() => setEditing({ kind: 'basics' })}>
              {t('edit')}
            </Button>
          }
        >
          {profile.summary || profile.city || profile.goals ? (
            <div className="flex flex-col gap-3">
              {profile.city && <p className="text-base text-fg">{profile.city}</p>}
              {profile.summary && (
                <p className="whitespace-pre-line text-base text-fg">{profile.summary}</p>
              )}
              {profile.goals && (
                <div>
                  <p className="text-sm font-medium text-fg-muted">{t('goalsLabel')}</p>
                  <p className="whitespace-pre-line text-base text-fg">{profile.goals}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-base text-fg-muted">{t('empty')}</p>
          )}
        </Block>

        {ENTRY_SECTIONS.map(({ section, key }) => (
          <Block
            key={section}
            id={key}
            title={sections(section)}
            meta={metaOf(entries(key).length, t('metaEntries', { count: entries(key).length }))}
            open={openSections.has(key)}
            onToggle={() => toggle(key)}
            action={
              <Button variant="secondary" onClick={() => setEditing({ kind: 'entry', section })}>
                {t('add')}
              </Button>
            }
          >
            {entries(key).length === 0 ? (
              <p className="text-base text-fg-muted">{t('empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {entries(key).map((entry) => (
                  <li key={entry.id} className="rounded-control border border-border p-3">
                    <EntrySummary section={section as CvSection} value={entry} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={entry.source === 'CV' ? 'info' : 'neutral'}>
                        {entry.source === 'CV' ? t('fromCv') : t('manual')}
                      </Badge>
                      {entry.manuallyEdited && <Badge tone="success">{t('edited')}</Badge>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setEditing({ kind: 'entry', section, id: entry.id, values: entry })
                        }
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        variant="danger-outline"
                        onClick={() => setDeleting({ section, id: entry.id })}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        ))}

        <SkillsBlock
          profile={profile}
          actions={actions}
          run={(action, after) =>
            run(action, () => {
              after?.();
              router.refresh();
            })
          }
          pending={pending}
          title={t('skills')}
          meta={metaOf(profile.skills.length, t('metaSkills', { count: profile.skills.length }))}
          open={openSections.has('skills')}
          onToggle={() => toggle('skills')}
        />

        <Block
          id="links"
          title={t('links')}
          meta={metaOf(linkCount, t('metaLinks', { count: linkCount }))}
          open={openSections.has('links')}
          onToggle={() => toggle('links')}
          action={
            <Button variant="secondary" onClick={() => setEditing({ kind: 'links' })}>
              {t('edit')}
            </Button>
          }
        >
          {profile.linkedinUrl || profile.socialLinks.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {profile.linkedinUrl && (
                <li className="break-all text-base text-fg">
                  <span className="font-medium">{t('linkedin')}: </span>
                  <a
                    className="text-primary underline"
                    href={profile.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {profile.linkedinUrl}
                  </a>
                </li>
              )}
              {profile.socialLinks.map((link) => (
                <li key={link.kind} className="break-all text-base text-fg">
                  <span className="font-medium">{t(`linkKinds.${link.kind}`)}: </span>
                  <a
                    className="text-primary underline"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {link.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-muted">{t('empty')}</p>
          )}
        </Block>
      </div>

      {afterSections}

      <Sheet
        open={editing?.kind === 'basics'}
        footer={editorFooter}
        onClose={() => !pending && setEditing(undefined)}
        title={t('basicsEdit')}
      >
        {editing?.kind === 'basics' && (
          <BasicsForm
            formId={editFormId}
            profile={profile}
            serverError={error ? errors(error) : undefined}
            onSave={(input) =>
              void run(
                () => actions.updateBasics(input),
                () => {
                  setEditing(undefined);
                  reveal('basics');
                },
              )
            }
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === 'entry'}
        footer={editorFooter}
        onClose={() => !pending && setEditing(undefined)}
        title={
          editing?.kind === 'entry'
            ? t(editing.id ? 'editEntry' : 'addEntry', { section: sections(editing.section) })
            : ''
        }
      >
        {editing?.kind === 'entry' && (
          <EntryEditor
            formId={editFormId}
            externalActions
            key={`${editing.section}-${editing.id ?? 'new'}`}
            section={editing.section as CvSection}
            initial={editing.values}
            submitLabel={t('save')}
            cancelLabel={t('cancel')}
            pending={pending}
            error={error ? errors(error) : undefined}
            onCancel={() => setEditing(undefined)}
            onSubmit={(values) =>
              void run(
                () =>
                  actions.saveEntry({
                    section: editing.section,
                    ...(editing.id ? { id: editing.id } : {}),
                    values,
                  } as SaveProfileEntryInput),
                () => {
                  setEditing(undefined);
                  reveal(ENTRY_SECTIONS.find((item) => item.section === editing.section)!.key);
                },
              )
            }
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === 'links'}
        footer={editorFooter}
        onClose={() => !pending && setEditing(undefined)}
        title={t('linksEdit')}
      >
        {editing?.kind === 'links' && (
          <LinksForm
            formId={editFormId}
            profile={profile}
            serverError={error ? errors(error) : undefined}
            onSave={async (linkedin, links) => {
              const first = await run(() => actions.setLinkedinUrl({ url: linkedin }));
              if (first) return;
              await run(
                () => actions.setSocialLinks({ links }),
                () => {
                  setEditing(undefined);
                  reveal('links');
                },
              );
            }}
          />
        )}
      </Sheet>

      <Modal
        open={deleting !== undefined}
        onClose={() => !pending && setDeleting(undefined)}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        footer={
          <>
            <Button
              variant="danger"
              fullWidth
              loading={pending}
              onClick={() =>
                deleting &&
                void run(
                  () => actions.deleteEntry(deleting),
                  () => setDeleting(undefined),
                )
              }
            >
              {t('deleteConfirm')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setDeleting(undefined)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}

/**
 * Katlanır bilgi bölümü. Başlık bir düğmedir (`aria-expanded`); "Ekle/Düzenle" bölümü açmadan çalışır, kaydedince bölüm açılır.
 * Kapalı panel `hidden`dır: ekran okuyucu ve sekme sırası dışındadır.
 */
function Block({
  id,
  title,
  meta,
  open,
  onToggle,
  action,
  children,
}: {
  id: string;
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const metaId = useId();
  return (
    <section id={`profile-${id}`} className="scroll-mt-20 rounded-card border border-border">
      <div className="flex items-center gap-2 pr-3">
        <h2 className="min-w-0 flex-1 text-xl font-semibold text-fg">
          {/* Özet (kayıt sayısı) görünür ama adın parçası değil: başlığın adı yalnız bölüm adıdır, özet açıklama olarak okunur. */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={metaId}
            onClick={onToggle}
            className="press-row flex min-h-16 w-full items-center gap-3 rounded-card px-4 py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block">{title}</span>
              <span
                id={metaId}
                aria-hidden="true"
                className="block text-base font-normal text-fg-muted"
              >
                {meta}
              </span>
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')}
            />
          </button>
        </h2>
        {action}
      </div>
      <div id={panelId} hidden={!open} className="flex flex-col gap-3 border-t border-border p-4">
        {children}
      </div>
    </section>
  );
}

function BasicsForm({
  profile,
  serverError,
  formId,
  onSave,
}: {
  profile: MyProfileData;
  serverError?: string;
  formId: string;
  onSave: (input: UpdateProfileBasicsInput) => void;
}) {
  const t = useTranslations('profile.my');
  const f = useTranslations('profile.fields');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [summary, setSummary] = useState(profile.summary ?? '');
  const [goals, setGoals] = useState(profile.goals ?? '');
  const tooLong = (value: string, max: number) => value.trim().length > max;
  const e = useTranslations('profile.entryErrors');
  const bad = {
    headline: tooLong(headline, PROFILE_TEXT_LIMITS.headline),
    city: tooLong(city, PROFILE_TEXT_LIMITS.city),
    summary: tooLong(summary, PROFILE_TEXT_LIMITS.summary),
    goals: tooLong(goals, PROFILE_TEXT_LIMITS.goals),
  };
  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.values(bad).some(Boolean)) return;
        onSave({ headline, city, summary, goals });
      }}
      className="flex flex-col gap-4"
    >
      {serverError && (
        <p role="alert" className="text-base text-danger">
          {serverError}
        </p>
      )}
      <Field label={f('headline')} error={bad.headline ? e('tooLong') : undefined}>
        {(control) => (
          <Input
            {...control}
            value={headline}
            maxLength={PROFILE_TEXT_LIMITS.headline + 50}
            onChange={(event) => setHeadline(event.target.value)}
          />
        )}
      </Field>
      <Field label={f('city')} error={bad.city ? e('tooLong') : undefined}>
        {(control) => (
          <Input {...control} value={city} onChange={(event) => setCity(event.target.value)} />
        )}
      </Field>
      <Field label={f('summary')} error={bad.summary ? e('tooLong') : undefined}>
        {(control) => (
          <Textarea
            {...control}
            rows={5}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('goalsLabel')} error={bad.goals ? e('tooLong') : undefined}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
          />
        )}
      </Field>
    </form>
  );
}

type LinkRow = { kind: SocialLinkKind | ''; url: string };

function LinksForm({
  profile,
  serverError,
  formId,
  onSave,
}: {
  profile: MyProfileData;
  serverError?: string;
  formId: string;
  onSave: (linkedin: string | null, links: { kind: SocialLinkKind; url: string }[]) => void;
}) {
  const t = useTranslations('profile.my');
  const [linkedin, setLinkedin] = useState(profile.linkedinUrl ?? '');
  const [rows, setRows] = useState<LinkRow[]>(
    profile.socialLinks.map((link) => ({ kind: link.kind, url: link.url })),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const sites = SOCIAL_LINK_KINDS.map((kind) => t(`linkKinds.${kind}`)).join(', ');

  function submit() {
    const found: Record<string, string> = {};
    let linkedinValue: string | null = null;
    if (linkedin.trim() !== '') {
      const result = normalizeLinkedinUrl(linkedin);
      if (result.ok) linkedinValue = result.url;
      else found.linkedin = t(`linkProblems.${result.problem}`);
    }
    const links: { kind: SocialLinkKind; url: string }[] = [];
    const used = new Set<string>();
    rows.forEach((row, index) => {
      if (row.kind === '' && row.url.trim() === '') return;
      if (row.kind === '') {
        found[`row${index}`] = t('linkProblems.PROFILE_LINK_HOST_NOT_ALLOWED');
        return;
      }
      if (used.has(row.kind)) {
        found[`row${index}`] = t('linkDuplicate');
        return;
      }
      used.add(row.kind);
      const result = normalizeSocialLink(row.kind, row.url);
      if (result.ok) links.push({ kind: row.kind, url: result.url });
      else found[`row${index}`] = t(`linkProblems.${result.problem}`);
    });
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    onSave(linkedinValue, links);
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      {serverError && (
        <p role="alert" className="text-base text-danger">
          {serverError}
        </p>
      )}
      <Field label={t('linkedin')} hint={t('linkedinHint')} error={problems.linkedin}>
        {(control) => (
          <Input
            {...control}
            inputMode="url"
            autoCapitalize="none"
            value={linkedin}
            onChange={(event) => setLinkedin(event.target.value)}
          />
        )}
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium text-fg">{t('socialTitle')}</legend>
        <p className="text-sm text-fg-muted">{t('allowedSites', { sites })}</p>
        {rows.map((row, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-card border border-border p-3">
            <Field label={t('siteLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={row.kind}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item, at) =>
                        at === index
                          ? { ...item, kind: event.target.value as SocialLinkKind }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">—</option>
                  {SOCIAL_LINK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`linkKinds.${kind}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('urlLabel')} error={problems[`row${index}`]}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="url"
                  autoCapitalize="none"
                  value={row.url}
                  onChange={(event) => {
                    setRows((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, url: event.target.value } : item,
                      ),
                    );
                    setProblems((current) => {
                      const { [`row${index}`]: _gone, ...rest } = current;
                      void _gone;
                      return rest;
                    });
                  }}
                />
              )}
            </Field>
            <Button
              variant="ghost"
              onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
            >
              {t('removeLink')}
            </Button>
          </div>
        ))}
        {rows.length < SOCIAL_LINK_KINDS.length && (
          <Button
            variant="secondary"
            onClick={() => setRows((current) => [...current, { kind: '', url: '' }])}
          >
            {t('addLink')}
          </Button>
        )}
      </fieldset>
    </form>
  );
}

function SkillsBlock({
  profile,
  actions,
  run,
  pending,
  title,
  meta,
  open,
  onToggle,
}: {
  profile: MyProfileData;
  actions: MyProfileActions;
  run: (action: () => Result, after?: () => void) => Promise<ErrorCode | null>;
  pending: boolean;
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('profile.my');
  const [name, setName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Öneri: en az 2 karakter; yarış olmasın diye yalnız son istek uygulanır.
  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await actions.suggestSkills({ query }).catch(() => null);
      if (!stale && result?.ok) setSuggestions(result.data.skills.map((skill) => skill.label));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [name, actions]);

  async function add(value: string) {
    const failed = await run(
      () => actions.addSkill({ name: value }),
      () => {
        setName('');
        setSuggestions([]);
      },
    );
    void failed;
  }

  const full = profile.skills.length >= PROFILE_SKILL_LIMIT;
  return (
    <Block id="skills" title={title} meta={meta} open={open} onToggle={onToggle}>
      {profile.skills.length === 0 ? (
        <p className="text-base text-fg-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <li
              key={skill.tagId}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-surface-strong pl-3 text-base text-fg"
            >
              <span className="min-w-0 truncate" title={skill.label}>
                {skill.label}
              </span>
              <button
                type="button"
                aria-label={t('skillRemove', { name: skill.label })}
                className="press-control inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-danger"
                onClick={() => void run(() => actions.removeSkill({ tagId: skill.tagId }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length >= 1) void add(name);
          }}
          className="flex flex-col gap-3"
        >
          <Field label={t('skillAdd')} hint={t('skillHint')}>
            {(control) => (
              <Input {...control} value={name} onChange={(event) => setName(event.target.value)} />
            )}
          </Field>
          {name.trim().length >= 2 && suggestions.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-fg-muted">{t('skillSuggestions')}</p>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((label) => (
                  <li key={label}>
                    <Button variant="secondary" onClick={() => void add(label)}>
                      {label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button type="submit" variant="secondary" loading={pending}>
            {t('skillAddButton')}
          </Button>
        </form>
      )}
    </Block>
  );
}
