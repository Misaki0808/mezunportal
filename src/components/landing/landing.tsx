import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { BrandLogo } from '@/components/brand/logo';
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  IconChip,
  UsersIcon,
} from '@/components/ui';
import type { IconChipTone } from '@/components/ui';
import type { LandingStats } from '@/server/services/landing';
import { HeroPreview } from './hero-preview';
import { CountUp, Reveal } from './motion';
import { RotatingLine } from './rotating-line';
import './landing.css';

/** Bölümün kendi sayfaları ve hesapları (kullanıcı kararı, 9 Kas). Dış bağlantılar yeni sekmede açılır; marka logoları kopyalanmaz. */
export const DEPARTMENT_LINKS = [
  { key: 'site', href: 'https://mis-iktisat.istanbul.edu.tr/tr/_' },
  { key: 'staff', href: 'https://mis-iktisat.istanbul.edu.tr/tr/akademikkadro' },
  { key: 'linkedin', href: 'https://www.linkedin.com/company/mis-iktisat/posts/' },
  { key: 'instagram', href: 'https://www.instagram.com/mis_iktisat/' },
  { key: 'club', href: 'https://www.instagram.com/iuybskulubu/' },
] as const;

/** Dönen satır anahtarları: mesaj kataloğundaki `landing.rotating` ile BİREBİR aynı olmalı (landing.test.tsx sınar). */
export const ROTATING_KEYS = [
  'line1',
  'line2',
  'line3',
  'line4',
  'line5',
  'line6',
  'line7',
  'line8',
  'line9',
  'line10',
] as const;

/** Sayı bandındaki sayıların simgeleri; renkler sırayla İris, Mercan, Nane (docs/design.md "Renk dağılımı"). */
const STAT_ITEMS = [
  { key: 'experiences', icon: <FileTextIcon />, tone: 'primary' },
  { key: 'mentors', icon: <UsersIcon />, tone: 'accent' },
  { key: 'meetings', icon: <CalendarIcon />, tone: 'success' },
  { key: 'jobs', icon: <BriefcaseIcon />, tone: 'primary' },
  { key: 'companies', icon: <BuildingIcon />, tone: 'accent' },
] as const satisfies readonly {
  key: keyof Omit<LandingStats, 'available'>;
  icon: React.ReactNode;
  tone: IconChipTone;
}[];

export async function Landing({ stats }: { stats: LandingStats }) {
  const t = await getTranslations('landing');
  const numbers = STAT_ITEMS.flatMap((item) => {
    const value = stats[item.key];
    return value === null ? [] : [{ ...item, value }];
  });
  const steps = ['verify', 'explore', 'connect'] as const;
  const questions = ['who', 'cost', 'privacy', 'mentor'] as const;
  // Mesaj kataloğu dizi kabul etmez (messages:check); satırlar sıralı anahtarlarla (line1…line9) tutulur.
  const lines = ROTATING_KEYS.map((key) => t(`rotating.${key}`));
  return (
    <div className="landing">
      <a href="#landing-main" className="landing-skip">
        {t('skip')}
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label={t('brand')}>
          <BrandLogo className="landing-logo" />
        </Link>
        <nav aria-label={t('navigation')} className="landing-header-links">
          <a href="#nasil-calisir">{t('navHow')}</a>
          <a href="#bolumumuz">{t('navDepartment')}</a>
        </nav>
        <Link href="/giris" className="landing-header-login">
          {t('navLogin')} <ChevronRightIcon />
        </Link>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-content landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">{t('faculty')}</p>
              <h1>
                {t('heroStart')} <span className="landing-title-mark">{t('heroEnd')}</span>
              </h1>
              <RotatingLine lines={lines} />
              <p className="landing-hero-description">{t('heroDescription')}</p>
              <div className="landing-hero-actions">
                <Link href="/giris" className="landing-primary">
                  {t('primary')} <ChevronRightIcon />
                </Link>
                <a href="#nasil-calisir" className="landing-secondary">
                  {t('secondary')}
                </a>
              </div>
              <p className="landing-trust">
                <CheckIcon />
                <span>
                  {t('trust')} {t('alumniStart')}
                </span>
              </p>
            </div>
            <HeroPreview t={(key) => t(`preview.${key}`)} />
          </div>
        </section>
        {numbers.length > 0 && (
          <section className="landing-stats" aria-label={t('statsLabel')}>
            <div className="landing-content landing-stats-inner">
              <div className="landing-stats-copy">
                <p className="landing-stats-intro">{t('statsIntro')}</p>
                <p className="landing-stats-note">{t('statsNote')}</p>
              </div>
              <dl>
                {numbers.map(({ key, value, icon, tone }) => (
                  <div key={key}>
                    <IconChip tone={tone}>{icon}</IconChip>
                    <dd>
                      <CountUp value={value} />
                    </dd>
                    <dt>{t(`stats.${key}`)}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}
        <section id="nasil-calisir" className="landing-section">
          <div className="landing-content">
            <Reveal>
              <div className="landing-section-head">
                <div>
                  <p className="landing-section-kicker">{t('howKicker')}</p>
                  <h2>{t('howTitle')}</h2>
                </div>
                <p>{t('howDescription')}</p>
              </div>
            </Reveal>
            <ol className="landing-steps">
              {steps.map((step, index) => (
                <li key={step}>
                  <Reveal>
                    <article className="landing-step">
                      <span className="landing-step-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <h3>{t(`steps.${step}.title`)}</h3>
                      <p>{t(`steps.${step}.description`)}</p>
                    </article>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section id="bolumumuz" className="landing-section landing-department">
          <div className="landing-content">
            <Reveal>
              <div className="landing-section-head">
                <div>
                  <p className="landing-section-kicker">{t('departmentKicker')}</p>
                  <h2>{t('departmentTitle')}</h2>
                </div>
                <p>{t('departmentDescription')}</p>
              </div>
            </Reveal>
            <ul className="landing-links">
              {DEPARTMENT_LINKS.map(({ key, href }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="landing-link-card"
                  >
                    <span>
                      <strong>{t(`links.${key}.name`)}</strong>
                      <small>{t(`links.${key}.description`)}</small>
                    </span>
                    <ExternalLinkIcon />
                    <span className="sr-only">{t('externalHint')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="landing-section">
          <div className="landing-content landing-faq-grid">
            <div>
              <p className="landing-section-kicker">{t('faqKicker')}</p>
              <h2>{t('faqTitle')}</h2>
              <p className="landing-faq-intro">{t('faqDescription')}</p>
            </div>
            <div className="landing-faq-list">
              {questions.map((key) => (
                <details key={key}>
                  <summary>
                    {t(`questions.${key}.question`)} <ChevronDownIcon />
                  </summary>
                  <p>{t(`questions.${key}.answer`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-closing">
          <div className="landing-content landing-closing-inner">
            <div>
              <h2>{t('closingTitle')}</h2>
              <p>{t('closingDescription')}</p>
            </div>
            <Link href="/giris" className="landing-primary">
              {t('primary')} <ChevronRightIcon />
            </Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-content landing-footer-inner">
          <div>
            <BrandLogo className="landing-footer-logo" label={t('brand')} />
            <p>{t('footerDescription')}</p>
          </div>
          <div className="landing-footer-links">
            <Link href="/hukuki/aydinlatma">{t('footerPrivacy')}</Link>
            <Link href="/hukuki/kullanim-sartlari">{t('footerTerms')}</Link>
            <Link href="/giris">{t('navLogin')}</Link>
          </div>
          <small>{t('footerNote')}</small>
        </div>
      </footer>
    </div>
  );
}
