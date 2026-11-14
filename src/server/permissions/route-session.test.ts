import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn(), log: vi.fn(), db: vi.fn(), storage: vi.fn() }));
vi.mock('./session', () => ({ getSessionUserId: state.session }));
vi.mock('../unexpected-log', () => ({ logUnexpected: state.log }));
vi.mock('../db', () => ({ getDb: state.db }));
vi.mock('../external/storage', () => ({ getStorage: state.storage }));

import { GET as appointment } from '@/app/api/randevu/[id]/ics/route';
import { GET as event } from '@/app/api/etkinlikler/[id]/ics/route';
import { GET as graduation } from '@/app/api/graduation-documents/[id]/file/route';
import { GET as cv } from '@/app/api/cv-inceleme/[id]/dosya/route';
import { GET as usage } from '@/app/api/yonetim/rapor/kullanim/route';
import { GET as employment } from '@/app/api/yonetim/rapor/istihdam/route';

const request = new Request('http://localhost/api/test');
const context = { params: Promise.resolve({ id: 'missing' }) };
const routes = [
  ['randevuIcs', () => appointment(request, context)],
  ['etkinlikIcs', () => event(request, context)],
  ['mezunBelgesiDosya', () => graduation(request, context)],
  ['cvIncelemeDosya', () => cv(request, context)],
  ['raporKullanim', () => usage(request)],
  ['raporIstihdam', () => employment(request)],
] as const;
beforeEach(() => vi.resetAllMocks());
describe.each(routes)('%s oturum sınırı', (source, run) => {
  it('altyapı hatasında veri sorgusuz 503 ve tek güvenli günlük', async () => {
    const error = new Error('sentetik gizli içerik');
    state.session.mockRejectedValue(error);
    const result = await run();
    expect(result.status).toBe(503);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('retry-after')).toBe('30');
    expect(await result.text()).toBe('');
    expect(state.log).toHaveBeenCalledExactlyOnceWith('route', source, error);
    expect(state.db).not.toHaveBeenCalled();
    expect(state.storage).not.toHaveBeenCalled();
  });
  it('gerçek oturumsuzluk 401 kalır', async () => {
    state.session.mockResolvedValue(null);
    expect((await run()).status).toBe(401);
    expect(state.log).not.toHaveBeenCalled();
    expect(state.db).not.toHaveBeenCalled();
  });
  it('Next kontrol sinyali aynen fırlar', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    state.session.mockRejectedValue(signal);
    await expect(run()).rejects.toBe(signal);
    expect(state.log).not.toHaveBeenCalled();
  });
});
