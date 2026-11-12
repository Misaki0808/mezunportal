import { describe, expect, it } from 'vitest';

import { INBOX_KIND_IDS } from '@/contracts/inbox';

import messages from '../../../messages/tr.json';
import {
  INBOX_KIND_KEYS,
  INBOX_KINDS,
  groupInbox,
  inboxHref,
  isInboxKind,
  type InboxItemRow,
} from './inbox';

const at = (iso: string) => new Date(iso);
let counter = 0;
const row = (
  kind: string,
  createdAt: string,
  options: { refId?: string; read?: boolean } = {},
): InboxItemRow => ({
  id: `n${++counter}`,
  kind,
  refId: options.refId ?? `ref${counter}`,
  createdAt: at(createdAt),
  readAt: options.read ? at(createdAt) : null,
});

describe('inbox kataloğu', () => {
  it('katalog, sözleşmedeki tür listesi ve metin kataloğuyla birebir eşleşir', () => {
    expect([...INBOX_KIND_KEYS].sort()).toEqual([...INBOX_KIND_IDS].sort());
    expect(Object.keys(INBOX_KINDS).sort()).toEqual([...INBOX_KIND_IDS].sort());
    expect(Object.keys(messages.inbox.kinds).sort()).toEqual([...INBOX_KIND_IDS].sort());
  });

  it('her türün tekil ve çoğul metni vardır; çoğul sayıyı taşır, hiçbiri kişisel veri alanı taşımaz', () => {
    for (const [kind, text] of Object.entries(messages.inbox.kinds)) {
      expect(text.one, kind).toBeTruthy();
      expect(text.many, kind).toContain('{count}');
      expect(text.one, kind).not.toContain('{count}');
      // Bildirim metninde değişken olarak yalnız sayı vardır (ad, e-posta, başlık gibi kişisel alan yok).
      expect(
        [...text.many.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
        kind,
      ).toEqual(['count']);
      expect(text.one, kind).not.toMatch(/\{/);
    }
  });

  it('isInboxKind bilinmeyen ve prototip anahtarlarını reddeder', () => {
    expect(isInboxKind('jobMatchPosting')).toBe(true);
    for (const value of ['', 'unknown', 'constructor', '__proto__', 'toString'])
      expect(isInboxKind(value), value).toBe(false);
  });
});

describe('inboxHref', () => {
  it.each([
    ['jobMatchPosting', 'abc-1', 1, '/ilanlar/abc-1'],
    ['jobMatchPosting', 'abc-1', 3, '/ilanlar'],
    ['appointmentConfirmed', 'ap-9', 1, '/randevular/ap-9'],
    ['appointmentConfirmed', 'ap-9', 2, '/randevular'],
    ['moderationApproved', 'exp-1', 1, '/deneyimlerim'],
    ['moderationApproved', 'exp-1', 4, '/deneyimlerim'],
    ['contact', 'c-1', 1, '/hesap/iletisim'],
    ['faqPublished', 'f-1', 1, '/hesap/sss'],
    ['jobPostingPublished', 'j-1', 1, '/ilanlarim'],
    ['referralUpdated', 'r-1', 1, '/hesap/referanslar'],
    ['cvReviewAnswered', 'cv-1', 1, '/hesap/cv-inceleme'],
    ['applicationWindowReminder', '2026-11', 1, '/basvuru-takvimi'],
  ] as const)('%s (%s, ×%i) → %s', (kind, refId, count, expected) => {
    expect(inboxHref(kind, refId, count)).toBe(expected);
  });

  it('kayıt kimliği yola kaçışlanır: yol dışına çıkamaz', () => {
    expect(inboxHref('jobMatchPosting', '../admin?x=1#y', 1)).toBe(
      '/ilanlar/..%2Fadmin%3Fx%3D1%23y',
    );
    expect(inboxHref('appointmentRequested', 'a/b', 1)).toBe('/randevular/a%2Fb');
  });

  it('bütün bağlantılar site içidir (`/` ile başlar, `//` ya da şema yok)', () => {
    for (const kind of INBOX_KIND_IDS)
      for (const count of [1, 2]) {
        const href = inboxHref(kind, 'https://evil.example/x', count);
        expect(href, `${kind} ×${count}`).toMatch(/^\/(?!\/)/);
        expect(href).not.toContain('://');
      }
  });
});

describe('groupInbox: aynı tür + aynı İstanbul günü tek satır', () => {
  // İstanbul UTC+3: 2026-11-12T21:30Z = 13 Kasım 00:30 (ertesi gün).
  const cases: {
    name: string;
    items: InboxItemRow[];
    expected: { kind: string; day: string; count: number; unread: number }[];
  }[] = [
    {
      name: 'aynı tür, aynı gün → tek grup (3)',
      items: [
        row('jobMatchPosting', '2026-11-12T12:00:00Z'),
        row('jobMatchPosting', '2026-11-12T10:00:00Z'),
        row('jobMatchPosting', '2026-11-12T08:00:00Z'),
      ],
      expected: [{ kind: 'jobMatchPosting', day: '2026-11-12', count: 3, unread: 3 }],
    },
    {
      name: 'aynı tür, farklı gün → iki grup',
      items: [
        row('jobMatchPosting', '2026-11-12T12:00:00Z'),
        row('jobMatchPosting', '2026-11-11T12:00:00Z'),
      ],
      expected: [
        { kind: 'jobMatchPosting', day: '2026-11-12', count: 1, unread: 1 },
        { kind: 'jobMatchPosting', day: '2026-11-11', count: 1, unread: 1 },
      ],
    },
    {
      name: 'farklı tür, aynı gün → ayrı gruplar',
      items: [
        row('jobMatchPosting', '2026-11-12T12:00:00Z'),
        row('contact', '2026-11-12T11:00:00Z'),
      ],
      expected: [
        { kind: 'jobMatchPosting', day: '2026-11-12', count: 1, unread: 1 },
        { kind: 'contact', day: '2026-11-12', count: 1, unread: 1 },
      ],
    },
    {
      name: 'gün sınırı İstanbul saatiyle: 21:30Z ertesi gündür, 20:59Z aynı gündür',
      items: [
        row('contact', '2026-11-12T21:30:00Z'),
        row('contact', '2026-11-12T20:59:00Z'),
        row('contact', '2026-11-12T20:00:00Z'),
      ],
      expected: [
        { kind: 'contact', day: '2026-11-13', count: 1, unread: 1 },
        { kind: 'contact', day: '2026-11-12', count: 2, unread: 2 },
      ],
    },
    {
      name: 'okunmuş ve okunmamış karışık → okunmamış sayısı doğru',
      items: [
        row('appointmentReminder', '2026-11-12T12:00:00Z', { read: true }),
        row('appointmentReminder', '2026-11-12T11:00:00Z'),
        row('appointmentReminder', '2026-11-12T10:00:00Z', { read: true }),
      ],
      expected: [{ kind: 'appointmentReminder', day: '2026-11-12', count: 3, unread: 1 }],
    },
    {
      name: 'hepsi okunmuş → okunmamış 0',
      items: [row('faqPublished', '2026-11-12T12:00:00Z', { read: true })],
      expected: [{ kind: 'faqPublished', day: '2026-11-12', count: 1, unread: 0 }],
    },
    {
      name: 'bilinmeyen tür (sonraki sürümden kalan kayıt) listede yok',
      items: [
        row('someFutureKind', '2026-11-12T12:00:00Z'),
        row('contact', '2026-11-12T11:00:00Z'),
      ],
      expected: [{ kind: 'contact', day: '2026-11-12', count: 1, unread: 1 }],
    },
    { name: 'boş girdi → boş liste', items: [], expected: [] },
  ];
  it.each(cases)('$name', ({ items, expected }) => {
    expect(
      groupInbox(items).map(({ kind, day, count, unread }) => ({ kind, day, count, unread })),
    ).toEqual(expected);
  });

  it('tek bildirim kendi kaydına, toplanmış satır liste sayfasına bağlanır', () => {
    const single = groupInbox([row('jobMatchPosting', '2026-11-12T12:00:00Z', { refId: 'p1' })]);
    expect(single[0]!.href).toBe('/ilanlar/p1');
    const many = groupInbox([
      row('jobMatchPosting', '2026-11-12T12:00:00Z', { refId: 'p1' }),
      row('jobMatchPosting', '2026-11-12T11:00:00Z', { refId: 'p2' }),
    ]);
    expect(many[0]!.href).toBe('/ilanlar');
  });

  it('grup, kayıt kimliklerini ve en yeni zamanı taşır; sıra girdi sırasıdır (yeniden eskiye)', () => {
    const items = [
      row('contact', '2026-11-12T12:00:00Z'),
      row('jobMatchPosting', '2026-11-12T11:00:00Z'),
      row('contact', '2026-11-12T10:00:00Z'),
    ];
    const groups = groupInbox(items);
    expect(groups.map((g) => g.kind)).toEqual(['contact', 'jobMatchPosting']);
    expect(groups[0]!.ids).toEqual([items[0]!.id, items[2]!.id]);
    expect(groups[0]!.latestAt).toEqual(at('2026-11-12T12:00:00Z'));
  });

  it('kişisel veri sızmaz: grup yalnız tür, gün, sayılar, kimlikler ve bağlantı taşır', () => {
    const [group] = groupInbox([row('contact', '2026-11-12T12:00:00Z')]);
    expect(Object.keys(group!).sort()).toEqual(
      ['category', 'count', 'day', 'href', 'ids', 'key', 'kind', 'latestAt', 'unread'].sort(),
    );
  });
});
