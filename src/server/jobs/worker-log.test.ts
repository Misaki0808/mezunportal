import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeWorkerLog } from './worker-log';

afterEach(() => vi.restoreAllMocks());
describe('işçi günlüğü zaman damgası', () => {
  it('sabit metne ISO zamanı ekler ve satırı tek tutar', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    writeWorkerLog('stderr', 'email.queue: unavailable\n');
    expect(write).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z email\.queue: unavailable\n$/),
    );
  });
  it('yapılandırılmış satırı JSON olarak ve ISO zamanıyla korur', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    writeWorkerLog('stdout', JSON.stringify({ event: 'email.sent' }));
    const event = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(event.event).toBe('email.sent');
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    expect(Object.keys(event).sort()).toEqual(['event', 'timestamp']);
  });
});
