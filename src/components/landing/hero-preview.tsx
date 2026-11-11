import {
  Avatar,
  Badge,
  BriefcaseIcon,
  buttonClasses,
  Card,
  ChevronRightIcon,
  IconChip,
  MapPinIcon,
} from '@/components/ui';

/**
 * Kahramanın sağ sütunu: ürünün KENDİ bileşenleriyle (Card, Badge, Avatar, IconChip, düğme sınıfları) çizilmiş, üst üste binen üç
 * ÖRNEK kart: deneyim, mentor, ilan. Ekran görüntüsü ya da görsel değil, canlı bileşen. İçerik açıkça örnektir (gerçek kişi/şirket yok,
 * seed'deki "Örnek …" dili) ve "Örnek görünüm" etiketi taşır. Süsleme: yalnız hafif eğim ve belirteç gölgesi; gradyan, parlama, yıldız yok.
 * Dekoratiftir: ekran okuyucudan gizlenir, etkileşimsizdir (`inert`; düğmeler gerçek düğme değil).
 */
export type PreviewKey =
  | 'label'
  | 'experience.badge'
  | 'experience.author'
  | 'experience.title'
  | 'experience.body'
  | 'experience.action'
  | 'mentor.name'
  | 'mentor.detail'
  | 'mentor.badge'
  | 'mentor.action'
  | 'job.company'
  | 'job.title'
  | 'job.place'
  | 'job.deadline';

/** Metinler `Landing`'in zaten aldığı çeviri işlevinden gelir (`landing.preview.*`): bileşen senkron kalır. */
export function HeroPreview({ t }: { t: (key: PreviewKey) => string }) {
  return (
    <div className="landing-preview" aria-hidden="true" inert>
      <Badge tone="neutral" className="landing-preview-label">
        {t('label')}
      </Badge>
      <div className="landing-preview-stack">
        <Card className="landing-preview-card landing-preview-experience">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone="category">{t('experience.badge')}</Badge>
            <span>{t('experience.author')}</span>
          </div>
          <p className="mt-3 text-lg font-semibold leading-snug text-fg">{t('experience.title')}</p>
          <p className="mt-2 text-fg-muted">{t('experience.body')}</p>
          <span className={`${buttonClasses({ variant: 'secondary' })} mt-4`}>
            {t('experience.action')}
          </span>
        </Card>
        <Card className="landing-preview-card landing-preview-mentor">
          <div className="flex items-center gap-3">
            <Avatar name={t('mentor.name')} decorative />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">{t('mentor.name')}</p>
              <p className="text-sm text-fg-muted">{t('mentor.detail')}</p>
            </div>
            <Badge tone="success">{t('mentor.badge')}</Badge>
          </div>
          <span className={`${buttonClasses()} mt-4`}>
            {t('mentor.action')}
            <ChevronRightIcon width={18} height={18} />
          </span>
        </Card>
        <Card className="landing-preview-card landing-preview-job">
          <div className="flex items-center gap-3">
            <IconChip tone="accent">
              <BriefcaseIcon />
            </IconChip>
            <div className="min-w-0">
              <p className="text-sm text-fg-muted">{t('job.company')}</p>
              <p className="font-semibold text-fg">{t('job.title')}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="category" className="gap-1">
              <MapPinIcon width={14} height={14} />
              {t('job.place')}
            </Badge>
            <Badge tone="info">{t('job.deadline')}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
