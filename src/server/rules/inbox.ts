import { INBOX_KIND_IDS, type InboxKindId } from '@/contracts/inbox';

import { istanbulDay } from './jobPosting';

/**
 * Uygulama içi bildirim kutusu kuralları (saf; veritabanı ve ağ yok).
 *
 * Kayıt yalnız `kind` + `refId` taşır. Metin (`messages/tr.json` `inbox.kinds.<kind>`) ve bağlantı BURADAKİ katalogdan
 * kurulur: bildirimde kişisel veri olmaz, bağlantı istemciden ya da veritabanından serbest metin olarak gelmez.
 */
export type InboxCategory =
  'job' | 'appointment' | 'experience' | 'contact' | 'faq' | 'cv' | 'referral' | 'calendar';

type KindDefinition = {
  category: InboxCategory;
  /** Tek bildirimde gidilen sayfa; yoksa `list` kullanılır. */
  item?: (refId: string) => string;
  /** Aynı gün birden çok bildirim tek satırda toplanınca gidilen liste sayfası. */
  list: string;
};
const encode = (value: string) => encodeURIComponent(value);

function appointment(): KindDefinition {
  return {
    category: 'appointment',
    list: '/randevular',
    item: (id) => `/randevular/${encode(id)}`,
  };
}

export const INBOX_KINDS = {
  jobMatchPosting: { category: 'job', list: '/ilanlar', item: (id) => `/ilanlar/${encode(id)}` },
  jobPostingPublished: { category: 'job', list: '/ilanlarim' },
  jobPostingRejected: { category: 'job', list: '/ilanlarim' },
  jobPostingExpired: { category: 'job', list: '/ilanlarim' },
  moderationApproved: { category: 'experience', list: '/deneyimlerim' },
  moderationRejected: { category: 'experience', list: '/deneyimlerim' },
  invitation: { category: 'experience', list: '/deneyimlerim' },
  contact: { category: 'contact', list: '/hesap/iletisim' },
  faqPublished: { category: 'faq', list: '/hesap/sss' },
  faqRejected: { category: 'faq', list: '/hesap/sss' },
  faqRedirected: { category: 'faq', list: '/hesap/sss' },
  faqAnswerPublished: { category: 'faq', list: '/hesap/sss' },
  referralUpdated: { category: 'referral', list: '/hesap/referanslar' },
  appointmentRequested: appointment(),
  appointmentConfirmed: appointment(),
  appointmentDeclined: appointment(),
  appointmentCancelled: appointment(),
  appointmentExpired: appointment(),
  appointmentReminder: appointment(),
  appointmentLinkNeeded: appointment(),
  appointmentLinkAdded: appointment(),
  cvReviewRequested: { category: 'cv', list: '/hesap/cv-inceleme' },
  cvReviewAnswered: { category: 'cv', list: '/hesap/cv-inceleme' },
  cvReviewExpired: { category: 'cv', list: '/hesap/cv-inceleme' },
  applicationWindowReminder: { category: 'calendar', list: '/basvuru-takvimi' },
} as const satisfies Record<InboxKindId, KindDefinition>;

export type InboxKind = InboxKindId;
export const INBOX_KIND_KEYS: readonly InboxKind[] = INBOX_KIND_IDS;
export function isInboxKind(value: string): value is InboxKind {
  return Object.hasOwn(INBOX_KINDS, value);
}

/** Tek bildirimde ilgili kayda, toplanmış satırda liste sayfasına gider. */
export function inboxHref(kind: InboxKind, refId: string, count: number): string {
  const definition: KindDefinition = INBOX_KINDS[kind];
  return count === 1 && definition.item ? definition.item(refId) : definition.list;
}

export type InboxItemRow = {
  id: string;
  kind: string;
  refId: string;
  createdAt: Date;
  readAt: Date | null;
};
export type InboxGroup = {
  /** Gün + tür: aynı tür ve aynı İstanbul günündeki bildirimler tek satırdır. */
  key: string;
  kind: InboxKind;
  category: InboxCategory;
  /** İstanbul takvim günü (`YYYY-MM-DD`). */
  day: string;
  count: number;
  unread: number;
  /** Okundu işaretlemede kullanılan kayıt kimlikleri (sahiplik sunucuda yeniden denetlenir). */
  ids: string[];
  latestAt: Date;
  href: string;
};

/**
 * Bildirimleri (aynı tür + aynı İstanbul günü) tek satırda toplar. Girdi sırası korunur: yeniden eskiye sıralı gelen
 * kayıtlarda her grup ilk görüldüğü (en yeni) yerde kalır. Bilinmeyen tür (sonraki sürümden kalan kayıt) listede yoktur.
 */
export function groupInbox(items: readonly InboxItemRow[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();
  for (const item of items) {
    if (!isInboxKind(item.kind)) continue;
    const day = istanbulDay(item.createdAt);
    const key = `${day}:${item.kind}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.unread += item.readAt ? 0 : 1;
      existing.ids.push(item.id);
      if (item.createdAt > existing.latestAt) existing.latestAt = item.createdAt;
      continue;
    }
    groups.set(key, {
      key,
      kind: item.kind,
      category: INBOX_KINDS[item.kind].category,
      day,
      count: 1,
      unread: item.readAt ? 0 : 1,
      ids: [item.id],
      latestAt: item.createdAt,
      href: '',
    });
  }
  const refs = new Map(items.map((item) => [item.id, item.refId]));
  return [...groups.values()].map((group) => ({
    ...group,
    // Tek bildirimde kendi kaydına bağlanır; toplanmış satırda liste sayfasına.
    href: inboxHref(group.kind, refs.get(group.ids[0]!) ?? '', group.count),
  }));
}
