import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calendar: vi.fn(), companies: vi.fn(), sectors: vi.fn() }));
vi.mock('@/server/permissions', () => ({ requireVerifiedMember: vi.fn().mockResolvedValue({}) }));
vi.mock('@/server/actions/application-window', () => ({
  getApplicationCalendar: mocks.calendar,
  listCalendarCompanies: mocks.companies,
}));
vi.mock('@/server/db', () => ({
  getDb: () => ({ sector: { findMany: mocks.sectors } }),
}));
vi.mock('@/components/application-window/calendar', () => ({ CalendarPage: () => null }));
import { CalendarPage } from '@/components/application-window/calendar';
import Page from './page';

type Element = { type: unknown; props: Record<string, unknown> };
const render = async (params: Record<string, string | string[] | undefined>) =>
  (await Page({ searchParams: Promise.resolve(params) })) as unknown as Element;

beforeEach(() => {
  mocks.calendar.mockReset();
  mocks.companies.mockReset().mockResolvedValue({
    ok: true,
    data: [
      { id: 'c1', name: 'Zirve' },
      { id: 'c2', name: 'Çözüm' },
    ],
  });
  mocks.sectors.mockReset().mockResolvedValue([{ id: 's1', name: 'Şans' }]);
});

describe('başvuru takvimi sayfası: liste parametre kuralı', () => {
  it('geçerli şirket kimliği takvimi açar; şirket listesi Türkçe sıradadır', async () => {
    mocks.calendar.mockResolvedValue({ ok: true, data: { months: [] } });
    const page = await render({ companyId: 'c1' });
    expect(page.type).toBe(CalendarPage);
    expect(page.props.scope).toEqual({ kind: 'COMPANY', id: 'c1' });
    expect(page.props.data).toEqual({ months: [] });
    expect((page.props.companies as { name: string }[]).map((c) => c.name)).toEqual([
      'Çözüm',
      'Zirve',
    ]);
  });

  it('olmayan şirket kimliği hata gövdesi değil, seçimsiz varsayılan sayfadır', async () => {
    mocks.calendar.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    const page = await render({ companyId: 'olmayan' });
    expect(page.type).toBe(CalendarPage);
    expect(page.props.scope).toBeNull();
    expect(page.props.data).toBeNull();
  });

  it.each([
    { companyId: '\u0000' },
    { companyId: 'x'.repeat(65) },
    { sectorId: ['a', 'b'] },
    { companyId: 'a\nb' },
  ])('geçersiz kimlik sorguya gitmeden varsayılana düşer: %j', async (params) => {
    const page = await render(params);
    expect(mocks.calendar).not.toHaveBeenCalled();
    expect(page.type).toBe(CalendarPage);
    expect(page.props.scope).toBeNull();
  });

  it('şirket seçicisi hepsini değil, seçili şirketi isteyerek (varsa) taşıyan listeyi kullanır', async () => {
    await render({});
    expect(mocks.companies).toHaveBeenLastCalledWith(undefined);
    mocks.calendar.mockResolvedValue({ ok: true, data: { months: [] } });
    await render({ companyId: 'c1' });
    expect(mocks.companies).toHaveBeenLastCalledWith('c1');
  });

  it('şirket listesi okunamazsa hata ekranı gösterir', async () => {
    mocks.companies.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const page = await render({});
    expect(page.type).not.toBe(CalendarPage);
  });

  it('beklenmeyen hata yine hata ekranıdır (yalnız bulunamadı varsayılana düşer)', async () => {
    mocks.calendar.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const page = await render({ companyId: 'c1' });
    expect(page.type).not.toBe(CalendarPage);
  });
});
