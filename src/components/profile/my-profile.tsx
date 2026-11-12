'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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
  /** Uzun eksik alan listesinden önce, ilk ekranda görünen ek bölüm (ör. katkı puanı özeti). */
  beforeCompletion?: ReactNode;
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
export function MyProfile({ initial, actions, beforeCompletion }: Props) {
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-10 pt-10 [overflow-wrap:anywhere] sm:pt-16">
      <header>
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
      </header>

      {/* Çekmece açıkken hata çekmecenin İÇİNDE (serverError) gösterilir; arkadaki sayfada yinelenmez. */}
      {error && !editing && (
        <div role="alert" className="text-base text-danger">
          {errors(error)}
        </div>
      )}

      <Button variant="secondary" onClick={() => setEditing({ kind: 'basics' })}>
        {t('editShortcut')}
      </Button>

      {beforeCompletion}

      <section aria-labelledby="completion" className="rounded-card border border-border p-4">
        <h2 id="completion" className="text-base font-semibold text-fg">
          {t('completion', { percent })}
        </h2>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-labelledby="completion"
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {missing.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-fg-muted">{t('missingTitle')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-fg">
              {missing.map((field) => (
                <li key={field}>{label(field)}</li>
              ))}
            </ul>
          </>
        )}
        {/* İlgi alanı, hedef, mentorluk ve gizlilik adımları tamamlansa da buradan yeniden açılır. */}
        <Link
          className={buttonClasses({ variant: 'secondary' }) + ' mt-3'}
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

      <Block
        title={t('basics')}
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
          title={sections(section)}
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
      />

      <Block
        title={t('links')}
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
                () => setEditing(undefined),
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
                () => setEditing(undefined),
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
                () => setEditing(undefined),
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

function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
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
}: {
  profile: MyProfileData;
  actions: MyProfileActions;
  run: (action: () => Result, after?: () => void) => Promise<ErrorCode | null>;
  pending: boolean;
  title: string;
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
    <Block title={title}>
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
