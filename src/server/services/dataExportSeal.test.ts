import { describe, expect, it } from 'vitest';

import {
  DATA_EXPORT_FORMAT_VERSION,
  DATA_EXPORT_UNREADABLE,
  dataExportSchema,
} from '@/contracts/privacy';

import { sealDataExport } from './dataExportSeal';

const iso = '2026-11-14T10:00:00.000Z';
function emptyExport(): Record<string, unknown> {
  return {
    formatVersion: DATA_EXPORT_FORMAT_VERSION,
    exportedAt: iso,
    alumniStories: [],
    storyConsentDecisions: [],
    user: {
      id: 'u1',
      name: 'Ad',
      email: 'a@example.org',
      phone: null,
      image: null,
      createdAt: iso,
    },
    notifications: [],
    notificationPreferences: [],
    mentorSettings: null,
    availability: [],
    graduationDocuments: [],
    profile: null,
    experiences: [],
    courseMarks: [],
    campusEvents: { registrations: [], attendances: [], created: [], reviews: [] },
    companyFollows: [],
    memberships: [],
    consents: [],
    fieldVisibility: [],
    contactRequests: { sent: [], received: [] },
    cv: {
      uploads: [],
      education: [],
      positions: [],
      languages: [],
      certifications: [],
      skills: [],
      experienceInvitations: [],
    },
    appointments: [],
    contribution: {
      awardPublicationDecisions: [],
      awards: [],
      awardCandidacies: [],
      entries: [],
      badges: [],
      suspicionFlags: [],
    },
    faq: { requests: [], answers: [] },
    jobPostings: [],
    referrals: [],
    jobMatches: [],
    cvReviewRequests: [],
    reports: [],
    integrations: [],
    sessions: [],
    emailLog: [],
    adminGrants: [],
    events: [],
    jobMatchDigests: [],
    notificationActions: [],
  };
}
/** Mühürlü dökümde yoldan değer okur (`get(data, 'user', 'phone')`). */
const get = (data: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], data);
const candidacy = (breakdown: unknown) => ({
  points: 1,
  experienceCount: 0,
  meetingCount: 0,
  departmentId: 'd',
  year: 2026,
  breakdown,
});

describe('sealDataExport (kart 372): alan düzeyinde mühür', () => {
  it('örnek döküm geçerlidir (testin dayanağı)', () => {
    expect(dataExportSchema.safeParse(emptyExport()).success).toBe(true);
  });

  it('geçerli döküm aynen döner, bozuk ve fazlalık listesi boştur', () => {
    const raw = emptyExport();
    const sealed = sealDataExport(raw);
    expect(sealed.data).toBe(raw);
    expect(sealed.unreadable).toEqual([]);
    expect(sealed.removed).toEqual([]);
  });

  it('şemaya uymayan tek alan UNREADABLE olur, komşular ve satırlar aynen kalır', () => {
    const raw = emptyExport();
    raw.contribution = {
      ...(raw.contribution as object),
      awardCandidacies: [
        candidacy('saçma'),
        candidacy([{ action: 'EXPERIENCE_PUBLISHED', points: 10 }]),
      ],
    };
    const sealed = sealDataExport(raw);
    const rows = ['contribution', 'awardCandidacies'];
    expect(get(sealed.data, ...rows, 0, 'breakdown')).toBe(DATA_EXPORT_UNREADABLE);
    expect(get(sealed.data, ...rows, 0)).toMatchObject({ points: 1, year: 2026 });
    expect(get(sealed.data, ...rows, 1, 'breakdown')).toEqual([
      { action: 'EXPERIENCE_PUBLISHED', points: 10 },
    ]);
    expect(sealed.unreadable).toEqual(['contribution.awardCandidacies[0].breakdown']);
  });

  it('çok sayıda bozuk alan: hepsi işaretlenir, tek geçişte (her yol bir kez)', () => {
    const raw = emptyExport();
    (raw.user as Record<string, unknown>).phone = 123;
    raw.mentorSettings = {
      isActive: true,
      monthlyCapacity: 'çok',
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      pausedUntil: null,
      cvReviewEnabled: false,
      cvReviewMonthlyLimit: 0,
      createdAt: iso,
      updatedAt: iso,
    };
    raw.notifications = [{ id: 'n', kind: 'k', refId: 'r', createdAt: iso, readAt: 5 }];
    const sealed = sealDataExport(raw);
    expect(new Set(sealed.unreadable)).toEqual(
      new Set(['user.phone', 'mentorSettings.monthlyCapacity', 'notifications[0].readAt']),
    );
    expect(get(sealed.data, 'user', 'phone')).toBe('UNREADABLE');
    expect(get(sealed.data, 'user', 'email')).toBe('a@example.org');
    expect(get(sealed.data, 'mentorSettings', 'sessionMinutes')).toBe(30);
    expect(get(sealed.data, 'notifications', 0)).toMatchObject({ id: 'n', readAt: 'UNREADABLE' });
  });

  it('eksik zorunlu alan da işaretlenir (anahtar eklenir)', () => {
    const raw = emptyExport();
    delete (raw.user as Record<string, unknown>).name;
    const sealed = sealDataExport(raw);
    expect(sealed.unreadable).toEqual(['user.name']);
    expect(get(sealed.data, 'user', 'name')).toBe('UNREADABLE');
  });

  it('sözleşmede olmayan anahtar çıktıdan atılır (karşı tarafın kimliği, dosya anahtarı, jeton kullanıcıya gitmez)', () => {
    const raw = emptyExport();
    raw.graduationDocuments = [
      {
        id: 'g',
        departmentId: 'd',
        graduationYear: 2024,
        status: 'APPROVED',
        rejectReason: null,
        reviewedAt: null,
        createdAt: iso,
        updatedAt: iso,
        storageKey: 'graduation/u1/x.pdf',
        reviewedById: 'baska-kullanici',
      },
    ];
    (raw.sessions as unknown[]).push({
      createdAt: iso,
      expiresAt: iso,
      ipAddress: null,
      userAgent: null,
      impersonated: false,
      token: 'gizli-jeton',
    });
    const sealed = sealDataExport(raw);
    expect(new Set(sealed.removed)).toEqual(
      new Set([
        'graduationDocuments[0].storageKey',
        'graduationDocuments[0].reviewedById',
        'sessions[0].token',
      ]),
    );
    expect(JSON.stringify(sealed.data)).not.toMatch(/gizli-jeton|baska-kullanici|x\.pdf/);
    expect(sealed.unreadable).toEqual([]);
    expect(get(sealed.data, 'graduationDocuments', 0, 'graduationYear')).toBe(2024);
  });

  it('çağıranın nesnesine dokunmaz (kopya üzerinde çalışır)', () => {
    const raw = emptyExport();
    (raw.user as Record<string, unknown>).phone = 5;
    sealDataExport(raw);
    expect((raw.user as Record<string, unknown>).phone).toBe(5);
  });

  it('kökün kendisi bozuksa (sürüm) mühürlenemez: hata fırlatır', () => {
    const raw = emptyExport();
    raw.formatVersion = 99;
    // sürüm alanı kök nesnenin alanıdır; yolu ['formatVersion'], işaretlenir (kök dizge/dizi olsaydı fırlardı)
    expect(sealDataExport(raw).unreadable).toEqual(['formatVersion']);
    expect(() => sealDataExport('bozuk')).toThrow('DATA_EXPORT_ROOT_INVALID');
    expect(() => sealDataExport(null)).toThrow('DATA_EXPORT_ROOT_INVALID');
  });
});
