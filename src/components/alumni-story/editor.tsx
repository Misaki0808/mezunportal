'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { saveStorySchema, type MyStory } from '@/contracts/alumni-story';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Switch,
  Textarea,
  captureFocus,
  rescueFocus,
} from '@/components/ui';
import { saveStory, setStoryConsent, submitStory } from '@/server/actions/alumni-story';

export function StoryEditor({
  departments,
  initial,
}: {
  departments: { id: string; name: string }[];
  initial: MyStory[];
}) {
  const t = useTranslations('alumniStory'),
    errors = useTranslations('errors.codes');
  const [all, setAll] = useState(initial),
    [departmentId, setDepartment] = useState(departments[0]?.id ?? '');
  const initialStory = initial.find((s) => s.departmentId === departments[0]?.id);
  const [body, setBody] = useState(initialStory?.body ?? ''),
    [consent, setConsent] = useState(initialStory?.consent ?? false),
    // Başarı metni (durum) ile hata (uyarı) ayrı tutulur: aynı metin hem `alert` hem `status` olarak iki kez duyurulmaz,
    // yeni bir işlem başlayınca ya da başka bölüm seçilince ikisi de silinir (bayat "Kaydedildi." kalmaz).
    [notice, setNotice] = useState(''),
    [problem, setProblem] = useState<{ text: string; field: 'body' | 'consent' | 'form' }>();
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const focusWanted = useRef<'body' | 'consent'>(undefined);
  const [focusTick, setFocusTick] = useState(0);
  // Hatalı alana odak: işlem sürerken izin anahtarı pasif olduğundan işlem bitince (pending=false) odaklanır.
  useEffect(() => {
    if (!focusWanted.current || pending) return;
    (focusWanted.current === 'body' ? bodyRef : consentRef).current?.focus();
    focusWanted.current = undefined;
  }, [focusTick, pending]);
  const clearMessages = () => {
    setNotice('');
    setProblem(undefined);
  };
  /** Hatayı gösterir; odaklanacak alanı (varsa) döner. */
  const fail = (text: string, field: 'body' | 'consent' | 'form') => {
    setProblem({ text, field });
    return field === 'form' ? undefined : field;
  };
  const story = all.find((s) => s.departmentId === departmentId);
  const alreadyApproved = story?.status === 'PUBLISHED' && story.body === body;
  const disabled = (condition: boolean, reason: string) =>
    condition ? { disabled: true as const, disabledReason: reason } : { disabled: false as const };
  function remember(updated: MyStory) {
    setAll((current) => [...current.filter((item) => item.id !== updated.id), updated]);
    setConsent(updated.consent);
  }
  function chooseDepartment(id: string) {
    const found = all.find((s) => s.departmentId === id);
    setDepartment(id);
    setBody(found?.body ?? '');
    setConsent(found?.consent ?? false);
    clearMessages();
  }
  function save(send: boolean) {
    // Kaydet/Gönder işlem sürerken pasifleşir (odak BODY'ye düşer); bitince düğmeye geri döner.
    const trigger = captureFocus();
    start(async () => {
      const field = await persist(send);
      if (field) {
        focusWanted.current = field;
        setFocusTick((tick) => tick + 1);
      } else rescueFocus(trigger);
    });
  }
  async function persist(send: boolean): Promise<'body' | 'consent' | undefined> {
    clearMessages();
    const parsed = saveStorySchema.safeParse({ departmentId, body, consent });
    if (!parsed.success) {
      return fail(t('invalid'), 'body');
    }
    if (send && !consent) {
      return fail(t('missingConsent'), 'consent');
    }
    const saved = await safeClientAction(() => saveStory(parsed.data));
    if (!saved.ok) {
      return fail(errors(saved.errorCode), 'form');
    }
    remember(saved.data);
    if (!send) {
      setNotice(t('saved'));
      return undefined;
    }
    const submitted = await safeClientAction(() => submitStory({ storyId: saved.data.id }));
    if (!submitted.ok) {
      return fail(errors(submitted.errorCode), 'form');
    }
    remember(submitted.data);
    setNotice(t('submitted'));
    return undefined;
  }
  function changeConsent(next: boolean) {
    clearMessages();
    if (!story) {
      setConsent(next);
      return;
    }
    const previous = consent;
    setConsent(next);
    const trigger = captureFocus();
    start(async () => {
      try {
        const result = await safeClientAction(() =>
          setStoryConsent({ storyId: story.id, consent: next }),
        );
        if (!result.ok) {
          setConsent(previous);
          fail(errors(result.errorCode), 'form');
          return;
        }
        remember(result.data);
        setNotice(t('consentSaved'));
      } finally {
        rescueFocus(trigger);
      }
    });
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <PageHeader title={t('editorTitle')} description={t('editorDescription')} />
      <Card className="space-y-5 p-5">
        <Field label={t('department')}>
          {(props) => (
            <Select
              {...props}
              value={departmentId}
              onChange={(event) => chooseDepartment(event.target.value)}
            >
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {story && (
          <p>
            {t('status')}: {t(`statuses.${story.status}`)}
          </p>
        )}
        {story?.moderationReason && <p>{story.moderationReason}</p>}
        <Field
          label={t('body')}
          hint={t('bodyHint')}
          error={problem?.field === 'body' ? problem.text : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              ref={bodyRef}
              rows={10}
              maxLength={3000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          )}
        </Field>
        <div>
          <Switch
            ref={consentRef}
            disabled={pending}
            checked={consent}
            label={t('consent')}
            description={t('consentHelp')}
            aria-invalid={problem?.field === 'consent' || undefined}
            aria-describedby={problem?.field === 'consent' ? 'story-consent-error' : undefined}
            onChange={(event) => changeConsent(event.target.checked)}
          />
          {problem?.field === 'consent' && (
            <p id="story-consent-error" role="alert" className="text-sm text-danger">
              {problem.text}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            {...disabled(
              pending || !departmentId || alreadyApproved,
              pending ? t('pending') : !departmentId ? t('noDepartments') : t('alreadyApproved'),
            )}
            onClick={() => save(true)}
          >
            {pending ? t('saving') : t('submit')}
          </Button>
          <Button
            variant="secondary"
            {...disabled(pending || !departmentId, pending ? t('pending') : t('noDepartments'))}
            onClick={() => save(false)}
          >
            {t('save')}
          </Button>
        </div>
        {/* Kaydet/Gönder düğmesi işlem sürerken yer değiştirir; odak sonuç metnine taşınır (data-focus-result). */}
        {notice && (
          <p role="status" tabIndex={-1} data-focus-result className="focus:outline-none">
            {notice}
          </p>
        )}
        {problem?.field === 'form' && (
          <p
            role="alert"
            tabIndex={-1}
            data-focus-result
            className="text-base text-danger focus:outline-none"
          >
            {problem.text}
          </p>
        )}
      </Card>
    </div>
  );
}
