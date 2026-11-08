import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ appointment: vi.fn(), feedback: vi.fn() }));
vi.mock('@/server/actions/appointment', () => ({
  getAppointment: mocks.appointment,
  cancelAppointment: vi.fn(),
  respondAppointment: vi.fn(),
  setMeetLink: vi.fn(),
}));
vi.mock('@/server/actions/feedback', () => ({ getFeedbackView: mocks.feedback }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/components/appointments/appointment-detail', () => ({ AppointmentDetail: () => null }));
vi.mock('@/components/ui', () => ({ ErrorState: () => null }));
import Page from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointment.mockResolvedValue({ ok: true, data: { id: 'allowed' } });
  mocks.feedback.mockResolvedValue({ ok: true, data: { submitted: false } });
});
it('inceleyici: randevu tarafı doğrulanınca hazır form girişini sunucu verir', async () => {
  const result = await Page({ params: Promise.resolve({ id: 'allowed' }) });
  expect(mocks.feedback).toHaveBeenCalledWith('allowed');
  expect(result.props.feedbackAvailable).toBe(true);
});
it('inceleyici: yabancı randevuda 404 ve form verisi sorgulanmaz', async () => {
  mocks.appointment.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  await expect(Page({ params: Promise.resolve({ id: 'foreign' }) })).rejects.toThrow(
    'NEXT_NOT_FOUND',
  );
  expect(mocks.feedback).not.toHaveBeenCalled();
});
it.each([
  { ok: false, errorCode: 'FEEDBACK_NOT_READY' },
  { ok: true, data: { submitted: true } },
])('inceleyici: hazır olmayan veya yanıtlanmış formda gönderim girişi yok (%j)', async (value) => {
  mocks.feedback.mockResolvedValue(value);
  const result = await Page({ params: Promise.resolve({ id: 'allowed' }) });
  expect(result.props.feedbackAvailable).toBe(false);
});
