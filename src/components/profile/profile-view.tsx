import { useTranslations } from 'next-intl';

import type { ProfileView as ProfileViewData } from '@/contracts/profile-content';

import { EntrySummary } from './entry-summary';

type Values = Record<string, unknown>;

/**
 * Başkasının profili. Sunucunun süzdüğü alanlar çizilir: gizli alanın anahtarı yanıtta yoktur ve ekran onu
 * ARAMAZ, “gizli” göstergesi çizmez (var olduğunu bile sızdırmaz). Hiçbir alan yoksa genel “gösterilecek bilgi yok”.
 */
export function ProfileView({ profile }: { profile: ProfileViewData }) {
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

  const list = (
    title: string,
    section: 'EDUCATION' | 'POSITION' | 'LANGUAGE' | 'CERTIFICATION',
    items: Values[],
  ) =>
    items.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-fg">{title}</h2>
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={index} className="rounded-control border border-border p-3">
              <EntrySummary section={section} value={item} />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-10 pt-10 [overflow-wrap:anywhere] sm:pt-16">
      <header>
        <h1 className="break-words text-3xl font-semibold tracking-tight text-fg">
          {profile.displayName}
        </h1>
        {profile.headline && <p className="mt-1 text-lg text-fg">{profile.headline}</p>}
        {profile.city && <p className="mt-1 text-base text-fg-muted">{profile.city}</p>}
        {profile.memberships.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('memberships')}>
            {profile.memberships.map((membership, index) => (
              <li
                key={index}
                className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-on-primary-soft"
              >
                {t(`roles.${membership.role}`)} · {membership.departmentName}
              </li>
            ))}
          </ul>
        )}
        {date && <p className="mt-2 text-sm text-fg-muted">{t('updated', { date })}</p>}
      </header>

      {!hasBody && (
        <section className="rounded-card border border-border p-6 text-center">
          <h2 className="text-lg font-semibold text-fg">{t('emptyTitle')}</h2>
          <p className="mt-1 text-base text-fg-muted">{t('emptyDescription')}</p>
        </section>
      )}

      {profile.summary && (
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">{t('summary')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">{profile.summary}</p>
        </section>
      )}
      {profile.goals && (
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">{t('goals')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">{profile.goals}</p>
        </section>
      )}
      {list(sections('EDUCATION'), 'EDUCATION', profile.education)}
      {list(sections('POSITION'), 'POSITION', profile.positions)}
      {list(sections('LANGUAGE'), 'LANGUAGE', profile.languages)}
      {list(sections('CERTIFICATION'), 'CERTIFICATION', profile.certifications)}
      {profile.skills.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">{t('skills')}</h2>
          <ul className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <li
                key={skill.label}
                className="max-w-full rounded-full bg-surface-strong px-3 py-1 text-base text-fg"
              >
                {skill.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(profile.linkedinUrl || (profile.socialLinks && profile.socialLinks.length > 0)) && (
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">{t('links')}</h2>
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
          </ul>
        </section>
      )}
      {(profile.email || profile.phone) && (
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">{t('contact')}</h2>
          <dl className="flex flex-col gap-1">
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
          </dl>
        </section>
      )}
    </article>
  );
}
