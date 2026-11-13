import 'server-only';
import { notificationCopy as t } from './notification-copy';
import type { QueuedEmail } from './email-core';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeText = (value: string) => escapeHtml(value).replaceAll('\n', '<br>');

/** Şablon bir iç bağlantı içermiyorsa eylem yalnız genel, yetkisi sunucuda denetlenen bir sayfaya gider. */
function actionFor(template: string): { label: string; path: string } {
  if (template === 'auth.sign-in-link') return { label: t('ctaSignIn'), path: '/giris' };
  if (template.startsWith('auth.change-email'))
    return { label: t('ctaVerifyEmail'), path: '/hesap/e-posta' };
  if (template.startsWith('graduation-document.'))
    return { label: t('ctaGraduation'), path: '/dogrulama' };
  if (template === 'appointment.feedback')
    return { label: t('ctaFeedback'), path: '/hesap/gorusmeler' };
  if (template.startsWith('appointment.'))
    return { label: t('ctaAppointment'), path: '/randevular' };
  if (template === 'contact.requested') return { label: t('ctaContact'), path: '/hesap/iletisim' };
  if (template === 'pilot.invitation') return { label: t('ctaInvitation'), path: '/giris' };
  if (template.startsWith('experience.'))
    return { label: t('ctaExperience'), path: '/deneyimlerim' };
  if (template === 'cv.invitation') return { label: t('ctaCvInvitation'), path: '/deneyimlerim' };
  if (template.startsWith('cv.')) return { label: t('ctaCv'), path: '/hesap/cv-inceleme' };
  if (template === 'alumni.still-there') return { label: t('ctaStillThere'), path: '/profil' };
  if (template === 'profile.freshness') return { label: t('ctaProfile'), path: '/profil' };
  if (template === 'student.email-migration')
    return { label: t('ctaChangeEmail'), path: '/hesap/e-posta' };
  if (template === 'faq.redirected') return { label: t('ctaMentor'), path: '/mentorlar' };
  if (template.startsWith('faq.')) return { label: t('ctaFaq'), path: '/hesap/sss' };
  if (template.startsWith('referral.'))
    return { label: t('ctaReferral'), path: '/hesap/referanslar' };
  if (template.startsWith('jobPosting.') || template.startsWith('jobMatch.'))
    return { label: t('ctaJobs'), path: '/ilanlar' };
  if (template.startsWith('applicationWindow.'))
    return { label: t('ctaApplication'), path: '/basvuru-takvimi' };
  if (template.startsWith('monthlyDigest.'))
    return { label: t('ctaDigest'), path: '/hesap/aylik-ozet' };
  return { label: t('ctaDefault'), path: '/hesap' };
}

/**
 * Gelen kutusu önizlemesi (preheader): selamlama ve bağlantılar atılır, yalnız ilk cümle girer. Gerekçe, not ve
 * ayrıntı satırları ilk cümleden sonra geldiği için kilit ekranına düşmez.
 */
export function preheaderOf(text: string): string {
  const line = text
    .replace(/https?:\/\/[^\s<>]+/g, '')
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part && !/^Merhaba,?$/.test(part));
  if (!line) return '';
  const first = line.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/)[0]!.replace(/[:\s]+$/, '');
  return first.length > 100 ? `${first.slice(0, 99).replace(/\s+\S*$/, '')}…` : first;
}

/**
 * Ret ve yönlendirme e-postaları (PM kararı, kart 305): konu satırında "reddedildi" yazılmadığı gibi ön izleme de SONUCU söylemez
 * ("…yayınlanmadı", "…onaylanamadı", "herkese açık değil"); nötr "incelendi; ayrıntılar e-postada" der, sonuç gövdede kalır.
 * Yeni bir ret şablonu eklenirse buraya ve `email-presentation-security.test.ts` tamlık denetimine eklenmelidir.
 */
const REVIEWED_PREVIEW = {
  'experience.moderation-rejected': 'preheaderReviewedExperience',
  'faq.rejected': 'preheaderReviewedFaq',
  'faq.redirected': 'preheaderReviewedFaq',
  'jobPosting.rejected': 'preheaderReviewedJobPosting',
  'graduation-document.rejected': 'preheaderReviewedDocument',
} as const;

/**
 * Kilit ekranı politikası: ön izleme kişi adı, e-posta adresi, işveren adı, gerekçe ve ret sonucu taşımaz (konu satırında
 * "reddedildi" yazılmamasıyla aynı gerekçe; ayrıntı gövdede kalır). İlk cümlesi böyle bilgi taşıyan şablonlar sabit, genel bir cümle
 * kullanır: randevu e-postaları (karşı tarafın adı), e-posta değişikliği onayı (yeni adres), "hâlâ çalışıyor musun" (işveren).
 * Savunma: başka bir şablonun ilk cümlesinde e-posta adresi çıkarsa genel cümleye düşer. Yeni şablon bu kurala uymuyorsa
 * `email-presentation-security.test.ts` kırılır.
 */
function preheaderFor(message: Pick<QueuedEmail, 'template' | 'text'>): string {
  const { template } = message;
  if (template.startsWith('appointment.') && template !== 'appointment.feedback')
    return t('preheaderAppointment');
  if (template === 'auth.change-email-confirmation') return t('preheaderChangeEmail');
  if (template === 'alumni.still-there') return t('preheaderStillThere');
  if (template in REVIEWED_PREVIEW)
    return t(REVIEWED_PREVIEW[template as keyof typeof REVIEWED_PREVIEW]);
  const own = preheaderOf(message.text);
  return /\S+@\S+/.test(own) ? t('preheaderGeneric') : own;
}

/** İkincil iç bağlantının görünen adı: adres ve yol; jeton/sorgu ekranda uzun dize olarak görünmez. */
function displayUrl(url: string): string {
  const parsed = new URL(url);
  const shown = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  return shown.length > 60 ? `${shown.slice(0, 59)}…` : shown;
}

function templateNeedsOriginalLink(template: string): boolean {
  return (
    template.startsWith('auth.') ||
    template === 'pilot.invitation' ||
    template === 'alumni.still-there'
  );
}

/** Bütün postaların düz metin/HTML biçimi ve tercih bağlantısı aynı sınırda oluşur. */
export function decorateEmail(message: QueuedEmail, appUrl: string): QueuedEmail {
  const base = new URL(appUrl);
  const preferenceUrl = new URL('/hesap/bildirimler', base).href;
  const text = `${message.text}\n\n${t('footer', { url: preferenceUrl })}`;
  const action = actionFor(message.template);
  const button = (url: string, label = action.label, secondary = false) =>
    `<a class="email-button${secondary ? ' email-button-secondary' : ''}" href="${escapeHtml(url)}" style="display:inline-block;${secondary ? 'background:#ffffff;color:#3730a3;border:2px solid #5b5bf6;' : 'background:#5b5bf6;color:#ffffff;'}text-decoration:none;font-weight:bold;font-size:16px;border-radius:10px;padding:${secondary ? '10px 18px' : '12px 20px'};margin:12px 0;max-width:100%;box-sizing:border-box">${escapeHtml(label)}</a>`;
  // Evet/Hayır sorusunda iki karar da düğmedir; "Evet:"/"Hayır:" ön ekleri düğme adında zaten var.
  const choice = message.template === 'alumni.still-there';
  let buttons = 0;
  let html = '';
  let last = 0;
  let hasButton = false;
  // Yalnız özgün gövdedeki ilk iç bağlantı eylemdir; altbilgideki tercih bağlantısı değildir.
  for (const match of message.text.matchAll(/https?:\/\/[^\s<>]+/g)) {
    const url = match[0];
    const before = message.text.slice(last, match.index);
    const lead = choice ? before.replace(/(?:Evet|Hayır):\s*$/, '') : before;
    html += escapeText(lead);
    // Düğme cümlenin ortasında kalmaz: satır başında değilse kendi satırına iner.
    const ownLine = lead === '' || /\n\s*$/.test(lead) ? '' : '<br>';
    let internal = false;
    try {
      internal = new URL(url).origin === base.origin;
    } catch {
      /* Bağlantı düz metin kalır. */
    }
    if (internal && !hasButton) {
      html += ownLine + button(url);
      hasButton = true;
      buttons += 1;
    } else if (internal && choice && buttons === 1) {
      html += ownLine + button(url, t('ctaStillThereNo'), true);
      buttons += 1;
    } else if (internal)
      html += `<a href="${escapeHtml(url)}" style="color:#3730a3;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(displayUrl(url))}</a>`;
    else html += escapeHtml(url);
    last = match.index + url.length;
  }
  html += escapeText(message.text.slice(last));
  if (!hasButton) {
    const needsOriginalLink = templateNeedsOriginalLink(message.template);
    html += `<br><br>${button(new URL(action.path, base).href, needsOriginalLink ? t('ctaDefault') : action.label)}`;
  }
  return {
    ...message,
    text,
    html: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(message.subject)}</title><style>@media (prefers-color-scheme:dark){.email-outer{background:#0e1a38!important;color:#f2f4fc!important}.email-header,.email-body{background:#15254a!important;color:#f2f4fc!important}.email-content a:not(.email-button),.email-footer a{color:#b8b8ff!important}.email-brand-portal{color:#a3a3ff!important}.email-brand-dot{color:#ff8798!important}.email-button{background:#a3a3ff!important;color:#0e1a38!important}.email-button-secondary{background:transparent!important;color:#b8b8ff!important;border-color:#a3a3ff!important}.email-footer{color:#d4d7eb!important}}</style></head><body class="email-outer" style="margin:0;background:#fff1e3;color:#202038;font-family:Arial,sans-serif;line-height:1.6"><div class="email-preheader" style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all">${escapeHtml(preheaderFor(message))}${'&zwnj;&nbsp;'.repeat(40)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr><td align="center" style="padding:24px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse"><tr><td class="email-header" style="background:#fffaf4;color:#1d1b33;font-size:24px;font-weight:800;letter-spacing:-0.5px;padding:18px 20px;border-bottom:3px solid #5b5bf6">mezun<span class="email-brand-portal" style="color:#5b5bf6">portal</span><span class="email-brand-dot" style="color:#ff6b7f">.</span></td></tr><tr><td class="email-body email-content" style="background:#ffffff;color:#202038;padding:20px;overflow-wrap:anywhere;word-break:break-word"><div style="white-space:pre-line;margin:0">${html}</div></td></tr><tr><td class="email-footer" style="padding:6px 4px 18px;color:#4e4b62;font-size:14px"><a href="${escapeHtml(preferenceUrl)}" style="color:#3730a3;display:inline-block;padding:12px 0">${escapeHtml(t('footerPreferences'))}</a><br>${escapeHtml(t('footerTagline'))}</td></tr></table></td></tr></table></body></html>`,
  };
}
