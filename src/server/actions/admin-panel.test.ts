import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

// Eylemler ince yapıştırıcıdır: sıra (koruma → doğrulama → servis) ve hata biçimi burada sınanır.
const mocks = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  requireAdmin: vi.fn(),
  panel: {
    getAdminOverview: vi.fn(),
    listAdminReports: vi.fn(),
    searchUsers: vi.fn(),
    getUserDetail: vi.fn(),
    listAdminGrants: vi.fn(),
    listAuditLog: vi.fn(),
  },
  dictionary: {
    listDictionaryEntries: vi.fn(),
    createDictionaryEntry: vi.fn(),
    updateDictionaryEntry: vi.fn(),
    deleteDictionaryEntry: vi.fn(),
    listUnmatchedValues: vi.fn(),
    resolveUnmatchedValue: vi.fn(),
  },
  employment: { getEmploymentReport: vi.fn() },
}));

vi.mock('../permissions', () => ({
  requireAnyAdmin: mocks.requireAnyAdmin,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('./deps', () => ({ adminUserDeps: () => ({ marker: 'deps' }) }));
vi.mock('../services/admin-panel', () => mocks.panel);
vi.mock('../services/admin-dictionary', () => mocks.dictionary);
vi.mock('../services/admin-employment', () => mocks.employment);
vi.mock('../services/admin-users', () => ({}));

import * as adminActions from './admin';
import * as userActions from './admin-users';

const ADMIN = { userId: 'oturum-yoneticisi', facts: {} };
beforeEach(() => {
  mocks.requireAnyAdmin.mockReset().mockResolvedValue(ADMIN);
  mocks.requireAdmin.mockReset().mockResolvedValue(ADMIN);
  for (const group of [mocks.panel, mocks.dictionary, mocks.employment]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
});

type Case = {
  name: string;
  call: () => Promise<unknown>;
  guard: 'any' | 'system';
  service: ReturnType<typeof vi.fn>;
  /** Servise giden (altyapı dışı) girdi; kimlik her zaman oturumdan gelir. */
  expectedInput?: unknown;
};
const cases: Case[] = [
  {
    name: 'getAdminOverview',
    call: () => adminActions.getAdminOverview(),
    guard: 'any',
    service: mocks.panel.getAdminOverview,
  },
  {
    name: 'listAdminReports',
    call: () => adminActions.listAdminReports({ departmentId: 'd' }),
    guard: 'any',
    service: mocks.panel.listAdminReports,
    expectedInput: { departmentId: 'd', status: 'OPEN', limit: 20 },
  },
  {
    name: 'getEmploymentReport',
    call: () => adminActions.getEmploymentReport({ graduationYearFrom: 2020 }),
    guard: 'any',
    service: mocks.employment.getEmploymentReport,
    expectedInput: { graduationYearFrom: 2020 },
  },
  {
    name: 'searchUsers',
    call: () => userActions.searchUsers({ query: 'ay' }),
    guard: 'any',
    service: mocks.panel.searchUsers,
    expectedInput: { query: 'ay', limit: 20 },
  },
  {
    name: 'getUserDetail',
    call: () => userActions.getUserDetail({ userId: 'u' }),
    guard: 'any',
    service: mocks.panel.getUserDetail,
    expectedInput: { userId: 'u' },
  },
  {
    name: 'listDictionaryEntries',
    call: () => adminActions.listDictionaryEntries({ kind: 'COMPANY' }),
    guard: 'system',
    service: mocks.dictionary.listDictionaryEntries,
    expectedInput: { kind: 'COMPANY', limit: 20 },
  },
  {
    name: 'createDictionaryEntry',
    call: () => adminActions.createDictionaryEntry({ kind: 'TITLE', name: 'Analist' }),
    guard: 'system',
    service: mocks.dictionary.createDictionaryEntry,
    expectedInput: { kind: 'TITLE', name: 'Analist', aliases: [] },
  },
  {
    name: 'updateDictionaryEntry',
    call: () => adminActions.updateDictionaryEntry({ kind: 'TITLE', id: 'i', name: 'Yeni Ad' }),
    guard: 'system',
    service: mocks.dictionary.updateDictionaryEntry,
    expectedInput: { kind: 'TITLE', id: 'i', name: 'Yeni Ad' },
  },
  {
    name: 'deleteDictionaryEntry',
    call: () =>
      adminActions.deleteDictionaryEntry({
        kind: 'TITLE',
        id: 'i',
        reason: 'Yinelenen kayıt',
        confirmed: true,
      }),
    guard: 'system',
    service: mocks.dictionary.deleteDictionaryEntry,
    expectedInput: { kind: 'TITLE', id: 'i', reason: 'Yinelenen kayıt', confirmed: true },
  },
  {
    name: 'listUnmatchedValues',
    call: () => adminActions.listUnmatchedValues({}),
    guard: 'system',
    service: mocks.dictionary.listUnmatchedValues,
    expectedInput: { status: 'OPEN', limit: 20 },
  },
  {
    name: 'resolveUnmatchedValue',
    call: () =>
      adminActions.resolveUnmatchedValue({ id: 'u', resolution: { type: 'LINK', entryId: 'e' } }),
    guard: 'system',
    service: mocks.dictionary.resolveUnmatchedValue,
    expectedInput: { id: 'u', resolution: { type: 'LINK', entryId: 'e' } },
  },
  {
    name: 'listAuditLog',
    call: () => adminActions.listAuditLog({ action: 'USER_SUSPEND' }),
    guard: 'system',
    service: mocks.panel.listAuditLog,
    expectedInput: { action: 'USER_SUSPEND', limit: 20 },
  },
  {
    name: 'listAdminGrants',
    call: () => userActions.listAdminGrants({}),
    guard: 'system',
    service: mocks.panel.listAdminGrants,
    expectedInput: { active: true, limit: 20 },
  },
];

const guardOf = (guard: Case['guard']) =>
  guard === 'any' ? mocks.requireAnyAdmin : mocks.requireAdmin;

describe('panel eylemleri', () => {
  it.each(cases)('$name: koruma servisten önce gelir; yetkisizde servis çağrılmaz', async (c) => {
    guardOf(c.guard).mockRejectedValue(codedForbidden('AUTH_FORBIDDEN'));
    expect(await c.call()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    expect(c.service).not.toHaveBeenCalled();
  });

  it.each(cases)('$name: oturumsuz AUTH_UNAUTHENTICATED', async (c) => {
    guardOf(c.guard).mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await c.call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    expect(c.service).not.toHaveBeenCalled();
  });

  it.each(cases)(
    '$name: sistem eylemleri SİSTEM korumasıyla, diğerleri herhangi bir yönetici korumasıyla çağrılır',
    async (c) => {
      c.service.mockResolvedValue({ ok: 1 });
      await c.call();
      if (c.guard === 'system') {
        expect(mocks.requireAdmin).toHaveBeenCalledWith({ kind: 'SYSTEM' });
        expect(mocks.requireAnyAdmin).not.toHaveBeenCalled();
      } else {
        expect(mocks.requireAnyAdmin).toHaveBeenCalledTimes(1);
        expect(mocks.requireAdmin).not.toHaveBeenCalled();
      }
    },
  );

  it.each(cases)('$name: kimlik oturumdan, doğrulanmış girdi servise gider', async (c) => {
    c.service.mockResolvedValue({ ok: 1 });
    expect(await c.call()).toEqual({ ok: true, data: { ok: 1 } });
    const args = c.service.mock.calls[0]!;
    expect(args[0]).toEqual({ marker: 'deps' });
    expect(args[1]).toBe('oturum-yoneticisi');
    if (c.expectedInput !== undefined) expect(args[2]).toEqual(c.expectedInput);
  });

  it.each(cases)('$name: beklenmeyen hata ayrıntı sızdırmaz', async (c) => {
    c.service.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await c.call()).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });

  it('geçersiz girdi servise ulaşmaz; kimlik/yetki alanları reddedilir', async () => {
    const results = await Promise.all([
      adminActions.listAdminReports({ status: 'HER_SEY' } as never),
      adminActions.listAdminReports({ userId: 'baska', role: 'SYSTEM' } as never),
      adminActions.createDictionaryEntry({ kind: 'TITLE', name: 'x' }),
      adminActions.createDictionaryEntry({
        kind: 'COMPANY',
        name: 'Ad',
        actorId: 'baska',
      } as never),
      adminActions.deleteDictionaryEntry({
        kind: 'TITLE',
        id: 'i',
        reason: 'Sebep var',
        confirmed: false,
      } as never),
      adminActions.resolveUnmatchedValue({
        id: 'u',
        resolution: { type: 'DISMISS', reason: 'Sebep var' },
      } as never),
      adminActions.getEmploymentReport({ departmentId: 'd', facultyId: 'f' }),
      adminActions.getEmploymentReport({ graduationYearFrom: 2025, graduationYearTo: 2020 }),
      adminActions.listAuditLog({ from: '2030-01-01', to: '2020-01-01' } as never),
      userActions.searchUsers({ query: 'a' }),
      userActions.getUserDetail({ userId: '' }),
    ]);
    for (const result of results)
      expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    for (const group of [mocks.panel, mocks.dictionary, mocks.employment]) {
      for (const fn of Object.values(group)) expect(fn).not.toHaveBeenCalled();
    }
  });
});
