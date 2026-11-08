import { describe, expect, it } from 'vitest';

import { isErrorCode } from '@/lib/errors';

import {
  SEEKER_ACTION_ACCESS,
  SEEKER_ACTION_ERRORS,
  SEEKER_CONTACT_NOT_REQUESTABLE,
  SEEKER_REF_PATTERN,
  hiringDeclarationSchema,
  previewSeekerContactSchema,
  requestSeekerContactSchema,
  searchSeekersSchema,
  seekerCardSchema,
  seekerContactPreviewSchema,
  seekerPageSchema,
  seekerSettingsSchema,
  setHiringDeclarationSchema,
  setSeekerSettingsSchema,
} from './job-seekers';

const card = {
  ref: 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab',
  departmentId: 'd1',
  departmentName: 'Yönetim Bilişim Sistemleri',
  classStanding: { kind: 'GRADE', grade: 3, extended: false },
  headline: 'Veri analizi meraklısı',
  tags: [{ kind: 'INTEREST', slug: 'veri-analizi' }],
  termYear: 2031,
  termSeason: 'SUMMER',
};

describe('aday kartı: beyaz liste, kimlik izi yok', () => {
  it('geçerli kart geçer; ad/e-posta/telefon/fotoğraf/kullanıcı kimliği eklenemez (strict)', () => {
    expect(seekerCardSchema.safeParse(card).success).toBe(true);
    for (const extra of [
      { name: 'Elif' },
      { displayName: 'Elif' },
      { email: 'a@b.cc' },
      { phone: '0532' },
      { photoUrl: 'x' },
      { userId: 'u1' },
      { createdAt: new Date() },
    ])
      expect(seekerCardSchema.safeParse({ ...card, ...extra }).success).toBe(false);
  });

  it('kartın şeklinde kullanıcı kimliği/ad/zaman izi taşıyan alan adı yoktur', () => {
    for (const key of Object.keys(seekerCardSchema.shape).filter((k) => k !== 'departmentName'))
      expect(key, key).not.toMatch(/user|name$|email|phone|photo|author|created|updated|member/i);
    expect(Object.keys(seekerCardSchema.shape).sort()).toEqual(
      [
        'classStanding',
        'departmentId',
        'departmentName',
        'headline',
        'ref',
        'tags',
        'termSeason',
        'termYear',
      ].sort(),
    );
  });

  it('başlık satırı en çok 120 karakter; etiket en çok 8; sınıf biçimi sabit', () => {
    expect(seekerCardSchema.safeParse({ ...card, headline: 'a'.repeat(121) }).success).toBe(false);
    expect(
      seekerCardSchema.safeParse({
        ...card,
        tags: Array.from({ length: 9 }, (_, i) => ({ kind: 'SKILL', slug: `s${i}` })),
      }).success,
    ).toBe(false);
    for (const classStanding of [
      { kind: 'PREPARATORY' },
      { kind: 'UNKNOWN' },
      { kind: 'GRADE', grade: 1, extended: true },
    ])
      expect(seekerCardSchema.safeParse({ ...card, classStanding }).success).toBe(true);
    expect(
      seekerCardSchema.safeParse({
        ...card,
        classStanding: { kind: 'GRADE', grade: 0, extended: false },
      }).success,
    ).toBe(false);
    expect(seekerCardSchema.safeParse({ ...card, classStanding: { kind: 'GRADE' } }).success).toBe(
      false,
    );
  });

  it('opak kimlik biçimi: küçük harf/rakam/tire 16-64; UUIDv4 geçer, kısa ya da büyük harf geçmez', () => {
    expect(SEEKER_REF_PATTERN.test(card.ref)).toBe(true);
    for (const bad of [
      'kisa',
      'ABCDEFGH-ABCDEFGH',
      'a b c d e f g h i j k l',
      '../etc/passwd-1234567890',
    ])
      expect(SEEKER_REF_PATTERN.test(bad), bad).toBe(false);
  });

  it('sayfa çıktısı strict ve kalan hakkı taşır', () => {
    expect(
      seekerPageSchema.safeParse({
        items: [card],
        total: 1,
        page: 1,
        pageSize: 10,
        remainingCardsToday: 49,
      }).success,
    ).toBe(true);
    expect(
      seekerPageSchema.safeParse({
        items: [card],
        total: 1,
        page: 1,
        pageSize: 10,
        remainingCardsToday: 49,
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe('ayarlar ve beyan', () => {
  it('dönem yıl + mevsim ikilisidir; yalnız biri geçersiz (SEEKER_TERM_INVALID)', () => {
    expect(setSeekerSettingsSchema.safeParse({ seekingInternship: false }).success).toBe(true);
    expect(
      setSeekerSettingsSchema.safeParse({
        seekingInternship: true,
        termYear: 2031,
        termSeason: 'SUMMER',
      }).success,
    ).toBe(true);
    expect(
      setSeekerSettingsSchema.safeParse({
        seekingInternship: true,
        termYear: null,
        termSeason: null,
      }).success,
    ).toBe(true);
    const onlyYear = setSeekerSettingsSchema.safeParse({ seekingInternship: true, termYear: 2031 });
    expect(onlyYear.success).toBe(false);
    expect(onlyYear.error?.issues[0]?.message).toBe('SEEKER_TERM_INVALID');
    expect(
      setSeekerSettingsSchema.safeParse({ seekingInternship: true, termSeason: 'SUMMER' }).success,
    ).toBe(false);
    for (const termYear of [2019, 2101, 2031.5])
      expect(
        setSeekerSettingsSchema.safeParse({
          seekingInternship: true,
          termYear,
          termSeason: 'SUMMER',
        }).success,
      ).toBe(false);
    expect(
      setSeekerSettingsSchema.safeParse({ seekingInternship: true, seekerRef: 'x'.repeat(20) })
        .success,
    ).toBe(false); // ref istemciden gelmez
  });

  it('ayar çıktısı rıza durumunu, görünürlüğü ve sayacı taşır; önizleme ref içermez', () => {
    const ok = {
      seekingInternship: true,
      termYear: 2031,
      termSeason: 'SUMMER',
      consent: { granted: true, currentVersion: 'taslak-1', needsAction: false },
      visible: true,
      viewCount: 3,
      preview: { ...card, ref: undefined },
    };
    const { ref: _ref, ...preview } = card;
    void _ref;
    expect(seekerSettingsSchema.safeParse({ ...ok, preview }).success).toBe(true);
    expect(seekerSettingsSchema.safeParse({ ...ok, preview: card }).success).toBe(false);
    expect(seekerSettingsSchema.safeParse({ ...ok, preview: null, viewCount: -1 }).success).toBe(
      false,
    );
  });

  it('beyan: yalnız bayrak gönderilir; çıktı yalnız bayrak ve zaman', () => {
    expect(setHiringDeclarationSchema.safeParse({ hiring: true }).success).toBe(true);
    expect(setHiringDeclarationSchema.safeParse({ hiring: 'evet' }).success).toBe(false);
    expect(setHiringDeclarationSchema.safeParse({ hiring: true, userId: 'u1' }).success).toBe(
      false,
    );
    expect(hiringDeclarationSchema.safeParse({ hiring: false, declaredAt: null }).success).toBe(
      true,
    );
  });
});

describe('arama ve iletişim girdileri', () => {
  it('arama varsayılanları ve sınırları; hedef kimlik/aday kimliği süzgeci yok', () => {
    expect(searchSeekersSchema.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(searchSeekersSchema.safeParse({ pageSize: 21 }).success).toBe(false);
    expect(
      searchSeekersSchema.safeParse({ tags: Array.from({ length: 6 }, (_, i) => `t${i}`) }).success,
    ).toBe(false);
    expect(
      searchSeekersSchema.safeParse({
        tags: ['veri-analizi'],
        termYear: 2031,
        termSeason: 'SUMMER',
      }).success,
    ).toBe(true);
    for (const extra of [{ userId: 'u1' }, { ref: card.ref }, { email: 'a@b.cc' }])
      expect(searchSeekersSchema.safeParse({ ...extra }).success).toBe(false);
  });

  it('iletişim: girdi opak ref; hedef kullanıcı kimliği istemciden alınmaz; alanlar en az bir ve tekrarsız', () => {
    expect(previewSeekerContactSchema.safeParse({ ref: card.ref }).success).toBe(true);
    expect(previewSeekerContactSchema.safeParse({ ref: 'kisa' }).success).toBe(false);
    expect(
      previewSeekerContactSchema.safeParse({ ref: card.ref, targetUserId: 'u1' }).success,
    ).toBe(false);
    const ok = (over: object) =>
      requestSeekerContactSchema.safeParse({ ref: card.ref, fields: ['EMAIL'], ...over }).success;
    expect(ok({})).toBe(true);
    expect(ok({ fields: [] })).toBe(false);
    expect(ok({ fields: ['EMAIL', 'EMAIL'] })).toBe(false);
    expect(ok({ targetUserId: 'u1' })).toBe(false);
    expect(ok({ message: 'a'.repeat(501) })).toBe(false);
  });

  it('önizleme çıktısı: ad/kimlik yok; olumsuz yanıt tek biçim', () => {
    const { ref: _ref, ...noRef } = card;
    void _ref;
    const yes = { canRequest: true, card: noRef, requestableFields: ['EMAIL'] };
    expect(seekerContactPreviewSchema.safeParse(yes).success).toBe(true);
    for (const key of ['displayName', 'userId', 'name'])
      expect(seekerContactPreviewSchema.safeParse({ ...yes, [key]: 'x' }).success).toBe(false);
    expect(seekerContactPreviewSchema.safeParse({ ...yes, card }).success).toBe(false); // ref yok
    expect(seekerContactPreviewSchema.safeParse(SEEKER_CONTACT_NOT_REQUESTABLE).success).toBe(true);
    expect(seekerContactPreviewSchema.safeParse({ ...yes, requestableFields: [] }).success).toBe(
      false,
    );
  });
});

describe('eylem kataloğu', () => {
  it('hata kodlarının hepsi kayıtlıdır; erişim kataloğu ve hata listesi aynı eylemlere sahiptir', () => {
    for (const codes of Object.values(SEEKER_ACTION_ERRORS))
      for (const code of codes) expect(isErrorCode(code)).toBe(true);
    expect(Object.keys(SEEKER_ACTION_ACCESS).sort()).toEqual(
      Object.keys(SEEKER_ACTION_ERRORS).sort(),
    );
    for (const codes of Object.values(SEEKER_ACTION_ERRORS))
      for (const code of ['AUTH_UNAUTHENTICATED', 'AUTH_FORBIDDEN', 'CONSENT_REQUIRED'])
        expect(codes as readonly string[]).toContain(code);
  });

  it('arama eylemleri beyanı ister: erişim sınıfı HIRING_ALUMNI ve beyan hatası listede', () => {
    for (const name of ['searchSeekers', 'previewSeekerContact', 'requestSeekerContact'] as const) {
      expect(SEEKER_ACTION_ACCESS[name]).toBe('HIRING_ALUMNI');
      expect(SEEKER_ACTION_ERRORS[name]).toContain('SEEKER_HIRING_DECLARATION_REQUIRED');
    }
    expect(SEEKER_ACTION_ACCESS.setSeekerSettings).toBe('STUDENT');
  });
});
