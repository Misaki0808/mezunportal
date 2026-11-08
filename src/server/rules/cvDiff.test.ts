import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ParsedEducation, ParsedLanguage } from '@/contracts/cv';

import {
  computeCvDiff,
  type CvProposal,
  type CvSnapshot,
  type ExistingEntry,
  type PositionEntry,
} from './cvDiff';

const EMPTY_SNAPSHOT: CvSnapshot = {
  profile: null,
  education: [],
  positions: [],
  languages: [],
  certifications: [],
  skills: [],
};
const EMPTY_PROPOSAL: CvProposal = {
  profile: { headline: null, summary: null, city: null },
  education: [],
  positions: [],
  languages: [],
  certifications: [],
  skills: [],
};

const position = (overrides: Partial<PositionEntry> = {}): PositionEntry => ({
  company: 'Aselsan A.Ş.',
  companyId: null,
  title: 'Yazılım Stajyeri',
  titleId: null,
  employmentType: 'INTERNSHIP',
  startDate: '2024-07',
  endDate: '2024-09',
  isCurrent: false,
  description: null,
  ...overrides,
});
const existing = <T>(value: T, isProtected = false): ExistingEntry<T> => ({
  id: randomUUID(),
  value,
  protected: isProtected,
});
const education = (overrides: Partial<ParsedEducation> = {}): ParsedEducation => ({
  institution: 'İstanbul Üniversitesi',
  level: 'BACHELOR',
  fieldOfStudy: 'Yönetim Bilişim Sistemleri',
  startDate: '2021',
  endDate: null,
  isCurrent: true,
  ...overrides,
});

describe('computeCvDiff', () => {
  it('boş profile her kalem NEW olur', () => {
    const diff = computeCvDiff(
      {
        profile: { headline: null, summary: null, city: null },
        education: [education()],
        positions: [position()],
        languages: [{ name: 'İngilizce', level: 'B2' }],
        certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'AWS', issuedDate: '2024-05' }],
        skills: [{ name: 'TypeScript', skillId: null }],
      },
      EMPTY_SNAPSHOT,
    );
    expect(diff.items.map((item) => item.status)).toEqual(['NEW', 'NEW', 'NEW', 'NEW', 'NEW']);
    expect(diff.items.map((item) => item.section)).toEqual([
      'EDUCATION',
      'POSITION',
      'LANGUAGE',
      'CERTIFICATION',
      'SKILL',
    ]);
    expect(diff.unchangedCount).toBe(0);
  });

  it('profildekiyle aynı kalem listelenmez, yalnız sayılır', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position()], skills: [{ name: 'SQL', skillId: null }] },
      {
        ...EMPTY_SNAPSHOT,
        positions: [existing(position())],
        skills: [existing({ name: 'sql', skillId: 'x' })],
      },
    );
    expect(diff.items).toEqual([]);
    expect(diff.unchangedCount).toBe(2);
  });

  it('elle düzeltilmemiş kalem farklıysa CHANGED, değişen alan adlarıyla', () => {
    const row = existing(position({ title: 'Stajyer', endDate: null, isCurrent: true }));
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position()] },
      { ...EMPTY_SNAPSHOT, positions: [row] },
    );
    expect(diff.items).toHaveLength(1);
    expect(diff.items[0]).toMatchObject({
      status: 'CHANGED',
      existingId: row.id,
      changedFields: ['title', 'endDate', 'isCurrent'],
    });
  });

  it('elle düzeltilmiş kalem farklıysa CONFLICT olur; sessizce CHANGED sayılmaz', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ title: 'Yazılım Stajyeri' })] },
      { ...EMPTY_SNAPSHOT, positions: [existing(position({ title: 'Backend Stajyeri' }), true)] },
    );
    expect(diff.items.map((item) => item.status)).toEqual(['CONFLICT']);
    expect(diff.items[0]?.current).toMatchObject({ title: 'Backend Stajyeri' });
    expect(diff.items[0]?.proposed).toMatchObject({ title: 'Yazılım Stajyeri' });
  });

  it('elle düzeltilmiş kalemle CV aynıysa çakışma yoktur', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position()] },
      { ...EMPTY_SNAPSHOT, positions: [existing(position(), true)] },
    );
    expect(diff.items).toEqual([]);
  });

  it('CV’de olmayan (null) değer fark sayılmaz: eksik bilgi profildekini silmez', () => {
    const current = position({ description: 'Elle yazdım', employmentType: 'INTERNSHIP' });
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ description: null, employmentType: null })] },
      { ...EMPTY_SNAPSHOT, positions: [existing(current, true)] },
    );
    expect(diff.items).toEqual([]);
  });

  it('şirket adı büyük/küçük harf, Türkçe karakter ve hukuki ek farkıyla aynı sayılır', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ company: 'ASELSAN' })] },
      { ...EMPTY_SNAPSHOT, positions: [existing(position({ company: 'Aselsan A.Ş.' }))] },
    );
    expect(diff.items).toEqual([]);
    expect(diff.unchangedCount).toBe(1);
  });

  it('aynı şirkette farklı başlangıç tarihi ayrı kalemdir (yeniden işe giriş)', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ startDate: '2025-02', endDate: null })] },
      { ...EMPTY_SNAPSHOT, positions: [existing(position({ startDate: '2023-02' }))] },
    );
    expect(diff.items.map((item) => item.status)).toEqual(['NEW']);
  });

  it('başlangıç tarihi bilinmiyorsa aynı şirket ve aynı unvan eşleşir', () => {
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ startDate: null })] },
      { ...EMPTY_SNAPSHOT, positions: [existing(position({ startDate: '2024-07' }))] },
    );
    expect(diff.items).toEqual([]);
  });

  it('şirket kimliği eşleşirse ad farklı olsa da aynı şirkettir', () => {
    const id = randomUUID();
    const diff = computeCvDiff(
      { ...EMPTY_PROPOSAL, positions: [position({ company: 'Aselsan', companyId: id })] },
      {
        ...EMPTY_SNAPSHOT,
        positions: [existing(position({ company: 'Aselsan Elektronik', companyId: id }))],
      },
    );
    expect(diff.items).toEqual([]);
  });

  it('CV içindeki yinelenen kalem tek sayılır', () => {
    const lang: ParsedLanguage = { name: 'Almanca', level: 'A2' };
    const diff = computeCvDiff(
      {
        ...EMPTY_PROPOSAL,
        languages: [lang, { name: 'almanca', level: 'B1' }],
        skills: [
          { name: 'Excel', skillId: null },
          { name: 'EXCEL', skillId: null },
        ],
      },
      EMPTY_SNAPSHOT,
    );
    expect(diff.items.filter((item) => item.section === 'LANGUAGE')).toHaveLength(1);
    expect(diff.items.filter((item) => item.section === 'SKILL')).toHaveLength(1);
  });

  it('dil seviyesi değişirse CHANGED, korumalıysa CONFLICT', () => {
    const proposal = {
      ...EMPTY_PROPOSAL,
      languages: [{ name: 'İngilizce', level: 'C1' as const }],
    };
    const current = { name: 'İngilizce', level: 'B2' as const };
    expect(
      computeCvDiff(proposal, { ...EMPTY_SNAPSHOT, languages: [existing(current)] }).items[0],
    ).toMatchObject({ status: 'CHANGED', changedFields: ['level'] });
    expect(
      computeCvDiff(proposal, { ...EMPTY_SNAPSHOT, languages: [existing(current, true)] }).items[0],
    ).toMatchObject({ status: 'CONFLICT' });
  });

  it('eğitim: aynı kurum + aynı seviye eşleşir; farklı seviye (lisans/yüksek lisans) ayrı kalemdir', () => {
    const base = {
      ...EMPTY_PROPOSAL,
      education: [education({ level: 'MASTER', startDate: '2025' })],
    };
    const diff = computeCvDiff(base, {
      ...EMPTY_SNAPSHOT,
      education: [existing(education({ level: 'BACHELOR' }))],
    });
    expect(diff.items.map((item) => item.status)).toEqual(['NEW']);
  });

  it('anahtar yalnız öneriden türer: profil değişince aynı öneri aynı anahtarı verir', () => {
    const proposal = { ...EMPTY_PROPOSAL, positions: [position()] };
    const a = computeCvDiff(proposal, EMPTY_SNAPSHOT).items[0]?.key;
    const b = computeCvDiff(proposal, {
      ...EMPTY_SNAPSHOT,
      positions: [existing(position({ title: 'Başka' }))],
    }).items[0]?.key;
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).toMatch(/^POSITION:[0-9a-f]{20}$/);
    expect(a).not.toContain('Aselsan');
  });
});

// --- Rastgele veri ile değişmezler (P1-01 dersi: sabit kimlik değil, her koşuda yeni veri) ---------------

function lcg(seed: number) {
  let state = seed;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('computeCvDiff — rastgele veriyle değişmezler', () => {
  const COMPANIES = ['Aselsan A.Ş.', 'Türk Telekom', 'Garanti BBVA', 'Acme Ltd. Şti.', 'Beta Inc'];
  const TITLES = ['Yazılım Stajyeri', 'Veri Analisti', 'İş Analisti', 'Stajyer'];
  const STARTS = ['2022-06', '2023-02', '2024-07', null];

  function randomPosition(next: () => number): PositionEntry {
    const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)] as T;
    return position({
      company: pick(COMPANIES),
      companyId: next() < 0.3 ? randomUUID() : null,
      title: pick(TITLES),
      startDate: pick(STARTS),
      endDate: null,
      isCurrent: next() < 0.5,
      description: next() < 0.4 ? `açıklama ${Math.floor(next() * 3)}` : null,
    });
  }

  it.each(Array.from({ length: 40 }, (_, index) => index))('tohum %i', (round) => {
    const next = lcg(Date.now() + round * 7919);
    const proposed = Array.from({ length: 1 + Math.floor(next() * 6) }, () => randomPosition(next));
    const current = Array.from({ length: Math.floor(next() * 6) }, () =>
      existing(randomPosition(next), next() < 0.5),
    );
    const snapshot = { ...EMPTY_SNAPSHOT, positions: current };
    const diff = computeCvDiff({ ...EMPTY_PROPOSAL, positions: proposed }, snapshot);
    const baseline = computeCvDiff({ ...EMPTY_PROPOSAL, positions: proposed }, EMPTY_SNAPSHOT);

    // Anahtarlar benzersizdir ve profilden bağımsızdır.
    const keys = diff.items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    const baselineKeys = new Set(baseline.items.map((item) => item.key));
    for (const key of keys) expect(baselineKeys.has(key)).toBe(true);

    // Her (tekilleştirilmiş) öneri ya listelenir ya da değişmemiş sayılır.
    expect(diff.items.length + diff.unchangedCount).toBe(baseline.items.length);

    for (const item of diff.items) {
      if (item.status === 'NEW') {
        expect(item.existingId).toBeNull();
        expect(item.current).toBeNull();
        continue;
      }
      const row = current.find((entry) => entry.id === item.existingId);
      expect(row).toBeDefined();
      // CONFLICT ⇔ eşleşen kalem korumalı.
      expect(item.status === 'CONFLICT').toBe(row?.protected);
      expect(item.changedFields.length).toBeGreaterThan(0);
    }
  });

  it('hiç korumalı kalem yokken CONFLICT, hepsi korumalıyken CHANGED çıkmaz', () => {
    for (let round = 0; round < 40; round += 1) {
      const next = lcg(round * 104729 + 1);
      const proposed = Array.from({ length: 5 }, () => randomPosition(next));
      const rows = Array.from({ length: 5 }, () => randomPosition(next));
      const open = computeCvDiff(
        { ...EMPTY_PROPOSAL, positions: proposed },
        { ...EMPTY_SNAPSHOT, positions: rows.map((row) => existing(row, false)) },
      );
      const locked = computeCvDiff(
        { ...EMPTY_PROPOSAL, positions: proposed },
        { ...EMPTY_SNAPSHOT, positions: rows.map((row) => existing(row, true)) },
      );
      expect(open.items.some((item) => item.status === 'CONFLICT')).toBe(false);
      expect(locked.items.some((item) => item.status === 'CHANGED')).toBe(false);
    }
  });
});

describe('PROFILE kalemi (başlık, özet, şehir)', () => {
  const profile = (
    headline: string | null,
    summary: string | null = null,
    city: string | null = null,
  ) => ({
    headline,
    summary,
    city,
  });
  const run = (
    proposed: ReturnType<typeof profile>,
    existingValue: ReturnType<typeof profile> | null,
    manual: ('headline' | 'summary' | 'city')[] = [],
  ) =>
    computeCvDiff(
      { ...EMPTY_PROPOSAL, profile: proposed },
      {
        ...EMPTY_SNAPSHOT,
        profile: existingValue ? { id: 'p1', value: existingValue, manualFields: manual } : null,
      },
    );

  it('CV’de hiç alan yoksa kalem yok', () => {
    expect(run(profile(null), profile('X'))).toEqual({ items: [], unchangedCount: 0 });
  });

  it('profil satırı yoksa ya da alan boşsa NEW; dolu ve farklıysa CHANGED; elle yazılmışsa CONFLICT', () => {
    expect(run(profile('A', null, 'B'), null).items[0]).toMatchObject({
      status: 'NEW',
      changedFields: ['headline', 'city'],
      existingId: null,
    });
    expect(run(profile('A'), profile(null)).items[0]).toMatchObject({
      status: 'NEW',
      existingId: 'p1',
    });
    expect(run(profile('Yeni'), profile('Eski')).items[0]).toMatchObject({
      status: 'CHANGED',
      changedFields: ['headline'],
    });
    expect(run(profile('Yeni'), profile('Eski'), ['headline']).items[0]).toMatchObject({
      status: 'CONFLICT',
    });
  });

  it('kalem durumu en ağır alanın durumudur; elle yazılmış ama CV’yle aynı alan çakışma yaratmaz', () => {
    expect(
      run(profile('A', 'Yeni özet'), profile('A', 'Eski özet'), ['headline']).items[0],
    ).toMatchObject({
      status: 'CHANGED',
      changedFields: ['summary'],
    });
    expect(run(profile('A', 'S', null), profile('A', null), ['headline']).items[0]).toMatchObject({
      status: 'NEW',
      changedFields: ['summary'],
    });
    expect(run(profile('A', 'Yeni'), profile(null, 'Eski'), ['summary']).items[0]).toMatchObject({
      status: 'CONFLICT',
    });
  });

  it('büyük/küçük harf ve Türkçe harf farkı değişiklik sayılmaz; kalem anahtarı profilden bağımsız', () => {
    const same = run(profile('İSTANBUL Analisti'), profile('istanbul analisti'));
    expect(same).toEqual({ items: [], unchangedCount: 1 });
    expect(run(profile('A'), null).items[0]?.key).toBe(
      run(profile('A'), profile('Z')).items[0]?.key,
    );
    expect(run(profile('A'), null).items[0]?.key).toMatch(/^PROFILE:[0-9a-f]{20}$/);
  });
});
