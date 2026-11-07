'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  Avatar,
  Badge,
  BriefcaseIcon,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  Pagination,
  RadioGroup,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Stepper,
  Switch,
  Tabs,
  Tag,
  Textarea,
  UserIcon,
  useToast,
  buttonClasses,
} from '@/components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Tasarım sistemi galerisi: PM turunda 390 ve 1440'ta görülür. Yalnız local/test ortamında açılır. */
export function Gallery() {
  const t = useTranslations('gallery');
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(2);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [tags, setTags] = useState(['removable']);
  const [step, setStep] = useState(1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="text-fg-muted">{t('intro')}</p>
      </header>

      <Section title={t('sections.buttons')}>
        <div className="flex flex-wrap items-start gap-3">
          <Button>{t('buttons.primary')}</Button>
          <Button variant="secondary">{t('buttons.secondary')}</Button>
          <Button variant="ghost">{t('buttons.ghost')}</Button>
          <Button variant="danger">{t('buttons.danger')}</Button>
          <Button size="lg">{t('buttons.lg')}</Button>
          <Button
            loading={loadingDemo}
            onClick={() => {
              setLoadingDemo(true);
              setTimeout(() => setLoadingDemo(false), 1500);
            }}
          >
            {t('buttons.loading')}
          </Button>
          <Button disabled disabledReason={t('buttons.disabledReason')}>
            {t('buttons.disabled')}
          </Button>
          <IconButton label={t('buttons.iconLabel')} icon={<UserIcon />} variant="secondary" />
          <a href="#" className={buttonClasses({ variant: 'secondary' })}>
            {t('buttons.ghost')}
          </a>
        </div>
      </Section>

      <Section title={t('sections.fields')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t('fields.nameLabel')}
            hint={t('fields.nameHint')}
            help={t('fields.nameHelp')}
            required
          >
            {(control) => <Input {...control} autoComplete="name" />}
          </Field>
          <Field label={t('fields.emailLabel')} error={t('fields.emailError')}>
            {(control) => (
              <Input
                {...control}
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue="ayse@"
              />
            )}
          </Field>
          <Field label={t('fields.departmentLabel')}>
            {(control) => (
              <Select {...control} defaultValue="">
                <option value="" disabled>
                  {t('fields.departmentPlaceholder')}
                </option>
                <option value="ybs">{t('fields.departmentYbs')}</option>
                <option value="other">{t('fields.departmentOther')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('fields.aboutLabel')}>{(control) => <Textarea {...control} />}</Field>
        </div>
      </Section>

      <Section title={t('sections.choices')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col">
            <Checkbox
              label={t('choices.checkbox')}
              description={t('choices.checkboxDescription')}
            />
            <Switch label={t('choices.switch')} description={t('choices.switchDescription')} />
          </div>
          <div className="flex flex-col gap-4">
            <RadioGroup
              legend={t('choices.radioLegend')}
              name="gallery-mode"
              defaultValue="online"
              options={[
                { value: 'online', label: t('choices.radioOnline') },
                { value: 'in-person', label: t('choices.radioInPerson') },
              ]}
            />
            <RadioGroup
              legend={t('choices.radioLegend')}
              name="gallery-mode-error"
              error={t('choices.radioError')}
              options={[
                { value: 'online', label: t('choices.radioOnline') },
                { value: 'in-person', label: t('choices.radioInPerson') },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title={t('sections.badges')}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t('badges.neutral')}</Badge>
          <Badge tone="info">{t('badges.info')}</Badge>
          <Badge tone="success">{t('badges.success')}</Badge>
          <Badge tone="warning">{t('badges.warning')}</Badge>
          <Badge tone="danger">{t('badges.danger')}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag label={t('badges.tag')} />
          {tags.map((id) => (
            <Tag
              key={id}
              label={t('badges.tagRemovable')}
              onRemove={() => setTags((current) => current.filter((value) => value !== id))}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={t('badges.avatarName')} size="sm" />
          <Avatar name={t('badges.avatarName')} />
          <Avatar name={t('badges.avatarName')} size="lg" />
        </div>
      </Section>

      <Section title={t('sections.cards')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card interactive>
            <h3 className="font-semibold">{t('cards.cardTitle')}</h3>
            <p className="text-fg-muted">{t('cards.cardBody')}</p>
          </Card>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            <li>
              <a href="#" className="press-row flex min-h-11 flex-col px-4 py-3">
                <span className="font-semibold">{t('cards.rowTitle')}</span>
                <span className="text-fg-muted">{t('cards.rowBody')}</span>
              </a>
            </li>
            <li>
              <a href="#" className="press-row flex min-h-11 flex-col px-4 py-3">
                <span className="font-semibold">{t('cards.rowTitle')}</span>
                <span className="text-fg-muted">{t('cards.rowBody')}</span>
              </a>
            </li>
          </ul>
        </div>
      </Section>

      <Section title={t('sections.overlays')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            {t('overlays.openModal')}
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            {t('overlays.openSheet')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.show({ message: t('overlays.toastInfoMessage') })}
          >
            {t('overlays.toastInfo')}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.show({ message: t('overlays.toastSuccessMessage'), tone: 'success' })
            }
          >
            {t('overlays.toastSuccess')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.show({ message: t('overlays.toastErrorMessage'), tone: 'error' })}
          >
            {t('overlays.toastError')}
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={t('overlays.modalTitle')}
          description={t('overlays.modalDescription')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                {t('overlays.modalCancel')}
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                {t('overlays.modalConfirm')}
              </Button>
            </>
          }
        >
          <p>{t('overlays.modalBody')}</p>
        </Modal>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('overlays.sheetTitle')}
          footer={<Button onClick={() => setSheetOpen(false)}>{t('overlays.sheetApply')}</Button>}
        >
          <p>{t('overlays.sheetBody')}</p>
        </Sheet>
      </Section>

      <Section title={t('sections.tabs')}>
        <Tabs
          label={t('tabs.label')}
          items={[
            { id: 'about', label: t('tabs.about'), content: <p>{t('tabs.aboutBody')}</p> },
            {
              id: 'experience',
              label: t('tabs.experience'),
              content: <p>{t('tabs.experienceBody')}</p>,
            },
            {
              id: 'education',
              label: t('tabs.education'),
              content: <p>{t('tabs.educationBody')}</p>,
            },
          ]}
        />
      </Section>

      <Section title={t('sections.states')}>
        <div className="grid gap-4 md:grid-cols-3">
          <Card aria-busy="true">
            <span className="sr-only">{t('states.loading')}</span>
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <Skeleton className="h-5 w-1/2" />
            </div>
            <SkeletonText className="mt-4" />
          </Card>
          <Card>
            <EmptyState
              title={t('states.emptyTitle')}
              description={t('states.emptyDescription')}
              icon={<BriefcaseIcon width={40} height={40} strokeWidth={1.5} />}
              action={<Button>{t('states.emptyAction')}</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              errorCode="SERVER_UNEXPECTED"
              onRetry={() => toast.show({ message: t('states.loading') })}
            />
          </Card>
        </div>
      </Section>

      <Section title={t('sections.navigation')}>
        <Pagination page={page} pageCount={7} onPageChange={setPage} />
        <Stepper
          current={step}
          steps={[
            { id: 'info', label: t('navigation.stepOne') },
            { id: 'verify', label: t('navigation.stepTwo') },
            { id: 'confirm', label: t('navigation.stepThree') },
            { id: 'done', label: t('navigation.stepFour') },
          ]}
        />
        <div className="flex gap-3">
          {step === 0 ? (
            <Button variant="secondary" disabled disabledReason={t('navigation.firstStep')}>
              {t('navigation.back')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              {t('navigation.back')}
            </Button>
          )}
          <Button onClick={() => setStep((step + 1) % 4)}>{t('navigation.next')}</Button>
        </div>
      </Section>
    </div>
  );
}
