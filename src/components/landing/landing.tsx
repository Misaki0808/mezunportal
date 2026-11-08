import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import {
  Badge,
  BriefcaseIcon,
  CalendarIcon,
  Card,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UsersIcon,
} from '@/components/ui';
import type { LandingStats } from '@/server/services/landing';
import { CountUp, Reveal } from './motion';
import { MentorPreview } from './mentor-preview';
import './landing.css';

export async function Landing({ stats }: { stats: LandingStats }) {
  const t = await getTranslations('landing');
  const numbers = [
    { key: 'experiences', value: stats.experiences },
    { key: 'mentors', value: stats.mentors },
    { key: 'meetings', value: stats.meetings },
  ] as const;
  const steps = ['verify', 'explore', 'connect'] as const;
  const questions = ['who', 'cost', 'privacy', 'mentor'] as const;
  return (
    <div className="landing">
      <a href="#landing-main" className="landing-skip">
        {t('skip')}
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label={t('brand')}>
          <span className="landing-brand-mark" aria-hidden="true">
            m<span>.</span>
          </span>
          <span>
            {t('brandWord')}
            <span className="landing-brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label={t('navigation')} className="landing-header-links">
          <a href="#nasil-calisir">{t('navHow')}</a>
          <a href="#ybs">{t('navYbs')}</a>
        </nav>
        <Link href="/giris" className="landing-header-login">
          {t('navLogin')} <ChevronRightIcon />
        </Link>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-hero-wave" aria-hidden="true" />
          <div className="landing-hero-shade" aria-hidden="true" />
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">
                <span className="landing-pulse" />
                {t('eyebrow')}
              </p>
              <h1>
                {t('heroStart')}
                <br />
                <span className="landing-title-accent">{t('heroEnd')}</span>
              </h1>
              <p className="landing-hero-description">{t('heroDescription')}</p>
              <div className="landing-rotating-line">
                <span>{t('rotatingLead')}</span>
                <span className="landing-rotating" aria-hidden="true">
                  {(['internship', 'mentor', 'experience', 'career'] as const).map((word) => (
                    <span key={word}>{t(`rotating.${word}`)}</span>
                  ))}
                </span>
                <span className="sr-only">{t('rotatingAccessible')}</span>
              </div>
              <div className="landing-hero-actions">
                <Link href="/giris" className="landing-primary">
                  {t('primary')} <ChevronRightIcon />
                </Link>
                <a href="#nasil-calisir" className="landing-secondary">
                  {t('secondary')} <span aria-hidden="true">↘</span>
                </a>
              </div>
              <p className="landing-trust">
                <CheckIcon />
                {t('trust')}
              </p>
            </div>
            <div className="landing-stage" aria-hidden="true" inert>
              <svg className="landing-doodle" viewBox="0 0 300 300" aria-hidden="true">
                <path
                  d="M20 190 C 55 90, 90 275, 145 140 S 230 45, 280 125"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="3 8"
                />
              </svg>
              <div className="landing-orbit landing-orbit-one" />
              <div className="landing-orbit landing-orbit-two" />
              <div className="landing-phone">
                <div className="landing-phone-top">
                  <span>{t('previewBrand')}</span>
                  <span>•••</span>
                </div>
                <div className="landing-phone-content">
                  <p className="landing-phone-kicker">{t('previewKicker')}</p>
                  <p className="landing-phone-heading">{t('previewHeading')}</p>
                  <Card className="landing-preview-card">
                    <Badge tone="info">{t('previewExperienceTag')}</Badge>
                    <p className="landing-preview-title">{t('previewExperience')}</p>
                    <p className="landing-preview-muted">{t('previewExperienceMeta')}</p>
                    <span className="landing-preview-arrow">↗</span>
                  </Card>
                  <MentorPreview />
                </div>
                <div className="landing-phone-bar" />
              </div>
              <Card className="landing-float-card landing-float-one">
                <span className="landing-float-icon">
                  <CalendarIcon />
                </span>
                <span>
                  <strong>{t('previewMeeting')}</strong>
                  <small>{t('previewMeetingMeta')}</small>
                </span>
              </Card>
              <Card className="landing-float-card landing-float-two">
                <span className="landing-float-icon coral">
                  <BriefcaseIcon />
                </span>
                <span>
                  <strong>{t('previewOpportunity')}</strong>
                  <small>{t('previewOpportunityMeta')}</small>
                </span>
              </Card>
              <span className="landing-spark landing-spark-one">✳</span>
              <span className="landing-spark landing-spark-two">✦</span>
            </div>
          </div>
          <div className="landing-hero-bottom">
            <span>{t('heroBottom')}</span>
            <span>{t('scroll')} ↓</span>
          </div>
        </section>
        <section className="landing-stats" aria-label={t('statsLabel')}>
          <div className="landing-content landing-stats-inner">
            <p className="landing-stats-intro">
              {t('statsIntro')} <span aria-hidden="true">✳</span>
            </p>
            <dl>
              {numbers.map(({ key, value }) => (
                <div key={key}>
                  <dt>{t(`stats.${key}`)}</dt>
                  <dd>
                    {value === null ? (
                      <span className="landing-new">
                        {stats.available ? t('newCommunity') : t('statsUnavailable')}
                      </span>
                    ) : (
                      <CountUp value={value} />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section id="nasil-calisir" className="landing-section landing-how">
          <div className="landing-content">
            <Reveal>
              <div className="landing-section-head">
                <div>
                  <p className="landing-section-kicker">{t('howKicker')}</p>
                  <h2>
                    {t('howTitle')}
                    <br />
                    <span>{t('howAccent')}</span>
                  </h2>
                </div>
                <p>{t('howDescription')}</p>
              </div>
            </Reveal>
            <div className="landing-steps">
              {steps.map((step, index) => (
                <Reveal key={step}>
                  <article className="landing-step">
                    <div className="landing-step-top">
                      <span className={`landing-step-icon landing-step-icon-${index}`}>
                        {index === 0 ? (
                          <CheckIcon />
                        ) : index === 1 ? (
                          <BriefcaseIcon />
                        ) : (
                          <UsersIcon />
                        )}
                      </span>
                      <span className="landing-step-number">0{index + 1}</span>
                    </div>
                    <h3>{t(`steps.${step}.title`)}</h3>
                    <p>{t(`steps.${step}.description`)}</p>
                    <span className="landing-step-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
        <section id="ybs" className="landing-section landing-ybs">
          <div className="landing-content landing-ybs-grid">
            <div className="landing-ybs-art" aria-hidden="true">
              <div className="landing-ybs-disk">
                <span>YBS</span>
                <small>✳</small>
              </div>
              <span className="landing-ybs-orbit">✦</span>
              <span className="landing-ybs-label">{t('ybsArt')}</span>
            </div>
            <Reveal>
              <div className="landing-ybs-copy">
                <p className="landing-section-kicker">{t('ybsKicker')}</p>
                <h2>
                  {t('ybsTitle')} <span>{t('ybsAccent')}</span>
                </h2>
                <p>{t('ybsDescription')}</p>
                <Link href="/giris" className="landing-text-link">
                  {t('ybsAction')} <ChevronRightIcon />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
        <section className="landing-section landing-faq">
          <div className="landing-content landing-faq-grid">
            <div>
              <p className="landing-section-kicker">{t('faqKicker')}</p>
              <h2>
                {t('faqTitle')}
                <br />
                <span>{t('faqAccent')}</span>
              </h2>
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
            <p className="landing-section-kicker">{t('closingKicker')}</p>
            <h2>
              {t('closingTitle')}
              <br />
              <span>{t('closingAccent')}</span>
            </h2>
            <p>{t('closingDescription')}</p>
            <Link href="/giris" className="landing-primary landing-primary-dark">
              {t('primary')} <ChevronRightIcon />
            </Link>
            <span className="landing-closing-spark" aria-hidden="true">
              ✳
            </span>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-content landing-footer-inner">
          <div>
            <span className="landing-footer-brand">
              {t('brandWord')}
              <span>.</span>
            </span>
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
