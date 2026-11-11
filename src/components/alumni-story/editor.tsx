'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { saveStorySchema, type MyStory } from '@/contracts/alumni-story';
import { Button, Card, Field, PageHeader, Select, Switch, Textarea } from '@/components/ui';
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
    [message, setMessage] = useState('');
  const [pending, start] = useTransition();
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
    setMessage('');
  }
  function save(send: boolean) {
    start(async () => {
      setMessage('');
      const parsed = saveStorySchema.safeParse({ departmentId, body, consent });
      if (!parsed.success) {
        setMessage(t('invalid'));
        return;
      }
      if (send && !consent) {
        setMessage(t('missingConsent'));
        return;
      }
      const saved = await saveStory(parsed.data);
      if (!saved.ok) {
        setMessage(errors(saved.errorCode));
        return;
      }
      remember(saved.data);
      if (!send) {
        setMessage(t('saved'));
        return;
      }
      const submitted = await submitStory({ storyId: saved.data.id });
      if (!submitted.ok) {
        setMessage(errors(submitted.errorCode));
        return;
      }
      remember(submitted.data);
      setMessage(t('submitted'));
    });
  }
  function changeConsent(next: boolean) {
    if (!story) {
      setConsent(next);
      return;
    }
    const previous = consent;
    setConsent(next);
    start(async () => {
      const result = await setStoryConsent({ storyId: story.id, consent: next });
      if (!result.ok) {
        setConsent(previous);
        setMessage(errors(result.errorCode));
        return;
      }
      remember(result.data);
      setMessage(t('consentSaved'));
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
          error={
            message &&
            message !== t('saved') &&
            message !== t('submitted') &&
            message !== t('consentSaved')
              ? message
              : undefined
          }
        >
          {(props) => (
            <Textarea
              {...props}
              rows={10}
              maxLength={3000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          )}
        </Field>
        <Switch
          disabled={pending}
          checked={consent}
          label={t('consent')}
          description={t('consentHelp')}
          onChange={(event) => changeConsent(event.target.checked)}
        />
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
        {message && <p role="status">{message}</p>}
      </Card>
    </div>
  );
}
