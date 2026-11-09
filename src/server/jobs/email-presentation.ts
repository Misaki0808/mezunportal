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
/** Bütün postaların düz metin/HTML biçimi ve tercih bağlantısı aynı sınırda oluşur. */
export function decorateEmail(message: QueuedEmail, appUrl: string): QueuedEmail {
  const base = new URL(appUrl);
  const preferenceUrl = new URL('/hesap/bildirimler', base).href;
  const text = `${message.text}\n\n${t('footer', { url: preferenceUrl })}`;
  const matcher = /https?:\/\/[^\s<>]+/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(matcher)) {
    const url = match[0];
    const index = match.index;
    html += escapeHtml(text.slice(last, index));
    let internal = false;
    try {
      internal = new URL(url).origin === base.origin;
    } catch {
      /* URL düz metin kalır. */
    }
    const escaped = escapeHtml(url);
    html += internal ? `<a href="${escaped}">${escaped}</a>` : escaped;
    last = index + url.length;
  }
  html += escapeHtml(text.slice(last));
  return {
    ...message,
    text,
    html:
      message.template === 'monthlyDigest.summary'
        ? `<!doctype html><html lang="tr"><body style="margin:0;background:#f4f3ff;color:#202038;font-family:Arial,sans-serif;line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:#5b5bf6;color:#ffffff;font-size:20px;font-weight:bold;padding:18px 20px;border-radius:16px 16px 0 0">MezunPortal</div><div style="background:#ffffff;color:#202038;padding:20px;border-radius:0 0 16px 16px;overflow-wrap:anywhere"><p style="white-space:pre-line;margin:0">${html}</p></div></div></body></html>`
        : `<!doctype html><html lang="tr"><body style="font-family: sans-serif; line-height: 1.5"><p style="white-space: pre-line">${html}</p></body></html>`,
  };
}
