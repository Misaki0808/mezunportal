import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  editable: vi.fn(),
  month: vi.fn(),
  departments: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/app/detail-route', () => ({
  requestEditableExperience: mocks.editable,
  requestOwnAppliedMonth: mocks.month,
}));
vi.mock('@/components/experience/verified-departments', () => ({
  loadVerifiedDepartments: mocks.departments,
}));
vi.mock('@/components/experience/experience-form', () => ({ ExperienceForm: () => null }));
vi.mock('@/server/actions/experience', () => ({
  saveExperienceDraft: vi.fn(),
  submitExperience: vi.fn(),
}));

import { ErrorState } from '@/components/ui';
import EditExperiencePage from './page';

const run = () => EditExperiencePage({ params: Promise.resolve({ id: 'exp-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.departments.mockResolvedValue({ ok: true, departments: [] });
});

describe('deneyim düzenle sayfası: altyapı hatası 404 olmaz (#232)', () => {
  it('veri okuması fırlatırsa (`!detail` dalı) 404 değil SERVER_UNEXPECTED hata ekranı', async () => {
    mocks.editable.mockRejectedValue(new Error('db down'));
    const page = (await run()) as { type: unknown; props: { errorCode: string } };
    expect(page.type).toBe(ErrorState);
    expect(page.props.errorCode).toBe('SERVER_UNEXPECTED');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('gerçek RESOURCE_NOT_FOUND 404 verir; başka hata kodu hata ekranında kalır, 404 olmaz', async () => {
    mocks.editable.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(run()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(mocks.notFound).toHaveBeenCalledTimes(1);

    mocks.notFound.mockClear();
    mocks.editable.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const page = (await run()) as { type: unknown; props: { errorCode: string } };
    expect(page.type).toBe(ErrorState);
    expect(page.props.errorCode).toBe('SERVER_UNEXPECTED');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
