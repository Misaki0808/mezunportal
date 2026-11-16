import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Avatar, Card } from '@/components/ui';
import type { ProfileView as ProfileViewData } from '@/contracts/profile-content';

import { EntrySummary } from './entry-summary';

type Values = Record<string, unknown>;

/**
 * Başkasının profili. Sunucunun süzdüğü alanlar çizilir: gizli alanın anahtarı yanıtta yoktur ve ekran onu
 * ARAMAZ, “gizli” göstergesi çizmez (var olduğunu bile sızdırmaz). Hiçbir alan yoksa genel “gösterilecek bilgi yok”.
 */
export function ProfileView({
  profile,
  badges,
  actions,
}: {
  profile: ProfileViewData;
  /** Rozet satırına eklenen küçük bilgi çipleri (örn. verdiği referans sayısı). */
  badges?: ReactNode;
  /** Başlığın hemen altında duran eylemler (örn. mentor giriş noktaları): birincil eylem kaydırmadan görünür. */
  actions?: ReactNode;
}) {
  const t = useTranslations('profile.view');
  const my = useTranslations('profile.my');
  const sections = useTranslations('profile.sections');
  const date = profile.lastUpdatedAt
    ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(
        new Date(profile.lastUpdatedAt),
      )
    : null;
  const hasBody =
    Boolean(profile.summary || profile.goals || profile.city) ||
    profile.education.length +
      profile.positions.length +
      profile.languages.length +
      profile.certifications.length +
      profile.skills.length >
      0 ||
    Boolean(profile.socialLinks?.length || profile.linkedinUrl || profile.email || profile.phone);

  // Güncel konum öne çıkar: şimdiki pozisyon ya da (yoksa) en üstteki kayıt.
  const current = profile.positions.find((item) => item.isCurrent === true) ?? profile.positions[0];
  const currentLine = current
    ? [current.title, current.company]
        .filter((part) => typeof part === 'string' && part)
        .join(' · ')
    : '';

  const section = (title: string, children: ReactNode, className?: string) => (
    <Card as="section" className={className}>
      <h2 className="text-lg font-bold text-fg">{title}</h2>
      <div className="mt-3">{children}</div>
    </Card>
  );

  const list = (
    title: string,
    sectionKind: 'EDUCATION' | 'POSITION' | 'LANGUAGE' | 'CERTIFICATION',
    items: Values[],
  ) =>
    items.length > 0 &&
    section(
      title,
      <ul className="divide-y divide-border">
        {items.map((item, index) => (
          <li key={index} className="py-3 first:pt-0 last:pb-0">
            <EntrySummary section={sectionKind} value={item} />
          </li>
        ))}
      </ul>,
    );

  const hasMain =
    !hasBody ||
    Boolean(profile.summary || profile.goals) ||
    profile.positions.length + profile.education.length > 0;

  return (
    <article className="w-full max-w-5xl [overflow-wrap:anywhere]">
      <Card as="header" className="flex flex-col gap-4 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          {/* Profil fotoğrafı yeri (kart 388): fotoğraf gelince `Avatar`'ın `src`'i dolar; yer aynı kalır. */}
          <div data-slot="profile-photo" className="shrink-0">
            <Avatar name={profile.displayName} size="xl" decorative />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[1.625rem] leading-[1.15] font-extrabold tracking-tight text-fg sm:text-[2.125rem]">
              {profile.displayName}
            </h1>
            {currentLine && (
              <p className="mt-1.5 break-words text-lg font-medium text-fg">{currentLine}</p>
            )}
            {profile.headline && (
              <p
                className={`break-words text-base ${currentLine ? 'text-fg-muted' : 'mt-1.5 text-lg font-medium text-fg'}`}
              >
                {profile.headline}
              </p>
            )}
            {profile.city && <p className="mt-1 text-base text-fg-muted">{profile.city}</p>}
          </div>
        </div>
        {(profile.memberships.length > 0 || badges) && (
          <ul className="flex flex-wrap items-center gap-2" aria-label={t('memberships')}>
            {profile.memberships.map((membership, index) => (
              <li
                key={index}
                className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-on-primary-soft"
              >
                {t(`roles.${membership.role}`)} · {membership.departmentName}
              </li>
            ))}
            {badges && <li>{badges}</li>}
          </ul>
        )}
        {date && <p className="text-sm text-fg-muted">{t('updated', { date })}</p>}
        {actions}
      </Card>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {hasMain && (
          <div className="flex min-w-0 flex-col gap-6">
            {!hasBody && (
              <Card as="section" className="p-6 text-center">
                <h2 className="text-lg font-semibold text-fg">{t('emptyTitle')}</h2>
                <p className="mt-1 text-base text-fg-muted">{t('emptyDescription')}</p>
              </Card>
            )}
            {profile.summary &&
              section(
                t('summary'),
                <p className="whitespace-pre-line text-base leading-relaxed text-fg">
                  {profile.summary}
                </p>,
              )}
            {profile.goals &&
              section(
                t('goals'),
                <p className="whitespace-pre-line text-base leading-relaxed text-fg">
                  {profile.goals}
                </p>,
              )}
            {list(sections('POSITION'), 'POSITION', profile.positions)}
            {list(sections('EDUCATION'), 'EDUCATION', profile.education)}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-6">
          {profile.skills.length > 0 &&
            section(
              t('skills'),
              <ul className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <li
                    key={skill.label}
                    className="max-w-full rounded-full bg-surface-strong px-3 py-1 text-base text-fg"
                  >
                    {skill.label}
                  </li>
                ))}
              </ul>,
            )}
          {list(sections('LANGUAGE'), 'LANGUAGE', profile.languages)}
          {list(sections('CERTIFICATION'), 'CERTIFICATION', profile.certifications)}
          {(profile.linkedinUrl || (profile.socialLinks && profile.socialLinks.length > 0)) &&
            section(
              t('links'),
              <ul className="flex flex-col gap-2">
                {profile.linkedinUrl && (
                  <li className="break-all text-base">
                    <span className="font-medium text-fg">{t('linkedin')}: </span>
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
                {profile.socialLinks?.map((link) => (
                  <li key={link.kind} className="break-all text-base">
                    <span className="font-medium text-fg">{my(`linkKinds.${link.kind}`)}: </span>
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
              </ul>,
            )}
          {(profile.email || profile.phone) &&
            section(
              t('contact'),
              <dl className="flex flex-col gap-2">
                {profile.email && (
                  <div>
                    <dt className="text-sm text-fg-muted">{t('email')}</dt>
                    <dd className="break-all text-base text-fg">
                      <a className="text-primary underline" href={`mailto:${profile.email}`}>
                        {profile.email}
                      </a>
                    </dd>
                  </div>
                )}
                {profile.phone && (
                  <div>
                    <dt className="text-sm text-fg-muted">{t('phone')}</dt>
                    <dd className="text-base text-fg">{profile.phone}</dd>
                  </div>
                )}
              </dl>,
            )}
        </div>
      </div>
    </article>
  );
}
