import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('@/app/(kimlik)/feedback-view', () => ({ getRequestFeedbackView: mocks.view }));
vi.mock('@/components/feedback/feedback-form', () => ({ FeedbackForm: () => null }));
import { FeedbackForm } from '@/components/feedback/feedback-form';
import Page from './page';

type Element = { type: unknown; props: Record<string, unknown> };
const render = async (id: string) =>
  (await Page({ params: Promise.resolve({ id }) })) as unknown as Element;

beforeEach(() => mocks.view.mockReset());

describe('görüşme geri bildirim sayfası', () => {
  it('geçerli görüşmede formu açar', async () => {
    mocks.view.mockResolvedValue({ ok: true, data: { appointmentId: 'a1' } });
    const page = await render('a1');
    expect(page.type).toBe(FeedbackForm);
  });

  it('adresteki bozuk kimlik (NUL) hata ekranı değil "bulunamadı" olur', async () => {
    mocks.view.mockResolvedValue({ ok: false, errorCode: 'VALIDATION_INVALID' });
    const page = await render('\u0000');
    expect(page.props.errorCode).toBe('RESOURCE_NOT_FOUND');
  });

  it('diğer hata kodlarını olduğu gibi gösterir', async () => {
    mocks.view.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect((await render('a1')).props.errorCode).toBe('SERVER_UNEXPECTED');
  });
});
