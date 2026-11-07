import { describe, expect, it } from 'vitest';

import {
  emailDomainOf,
  emailKindOf,
  matchEmailDomain,
  selfVerifiableRoles,
  type UniversityDomains,
} from './emailDomain';

const iu: UniversityDomains = {
  studentEmailDomains: ['ogr.iu.edu.tr'],
  staffEmailDomains: ['istanbul.edu.tr'],
};
const other: UniversityDomains = {
  studentEmailDomains: ['ogr.baska.edu.tr'],
  staffEmailDomains: [],
};

describe('emailDomainOf', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', 'ogr.iu.edu.tr'],
    ['Ayse@OGR.IU.EDU.TR', 'ogr.iu.edu.tr'],
    ['ayse@ogr.iu.edu.tr.', 'ogr.iu.edu.tr'],
    ['"a@b"@ogr.iu.edu.tr', 'ogr.iu.edu.tr'],
    ['ayse@', null],
    ['@iu.edu.tr', null],
    ['ayse', null],
    ['', null],
  ])('%j → %j', (email, expected) => {
    expect(emailDomainOf(email)).toBe(expected);
  });
});

describe('matchEmailDomain / selfVerifiableRoles', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', ['STUDENT']],
    ['hoca@istanbul.edu.tr', ['ACADEMIC']],
    ['AYSE@OGR.IU.EDU.TR', ['STUDENT']],
    // alt alan adı ve benzer alan adları EŞLEŞMEZ (tam eşleşme)
    ['ayse@x.ogr.iu.edu.tr', []],
    ['ayse@evil-ogr.iu.edu.tr', []],
    ['ayse@ogr.iu.edu.tr.evil.com', []],
    ['ayse@iu.edu.tr', []],
    ['ayse@iuc.edu.tr', []], // İÜ-Cerrahpaşa ayrı üniversite
    // kişisel e-posta: alan adıyla hiçbir şey doğrulanmaz (mezun belgesi gerekir)
    ['mezun@gmail.com', []],
    ['gecersiz', []],
  ])('%s → %j', (email, roles) => {
    expect(selfVerifiableRoles(email, iu)).toEqual(roles);
  });

  it('mezun (ALUMNI) alan adıyla asla doğrulanabilir roller arasında değildir', () => {
    for (const email of ['ayse@ogr.iu.edu.tr', 'hoca@istanbul.edu.tr']) {
      expect(selfVerifiableRoles(email, iu)).not.toContain('ALUMNI');
    }
  });

  it('aynı alan adı iki listede ise iki rol de döner', () => {
    const both: UniversityDomains = {
      studentEmailDomains: ['ortak.edu.tr'],
      staffEmailDomains: ['ORTAK.edu.tr'],
    };
    expect(matchEmailDomain('a@ortak.edu.tr', both)).toEqual({ student: true, staff: true });
    expect(selfVerifiableRoles('a@ortak.edu.tr', both)).toEqual(['STUDENT', 'ACADEMIC']);
  });

  it('kayıtlı alan adındaki büyük harf/boşluk/sondaki nokta normalleştirilir', () => {
    const messy: UniversityDomains = {
      studentEmailDomains: [' OGR.IU.EDU.TR. '],
      staffEmailDomains: [],
    };
    expect(selfVerifiableRoles('a@ogr.iu.edu.tr', messy)).toEqual(['STUDENT']);
  });
});

describe('emailKindOf', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', 'STUDENT_DOMAIN'],
    ['hoca@istanbul.edu.tr', 'STAFF_DOMAIN'],
    ['ogrenci@ogr.baska.edu.tr', 'STUDENT_DOMAIN'],
    ['mezun@gmail.com', 'OTHER'],
    ['gecersiz', 'OTHER'],
  ])('%s → %s', (email, kind) => {
    expect(emailKindOf(email, [iu, other])).toBe(kind);
  });

  it('kayıtlı üniversite yoksa her şey OTHER', () => {
    expect(emailKindOf('ayse@ogr.iu.edu.tr', [])).toBe('OTHER');
  });
});
