import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createQueue: vi.fn(),
  work: vi.fn(),
  schedule: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  purgeAuth: vi.fn(),
  purgeLinkedin: vi.fn(),
  detach: vi.fn(),
  freezeAwards: vi.fn(),
  rotateMonthly: vi.fn(),
  db: {},
}));
vi.mock('pg-boss', () => ({
  PgBoss: class {
    on() {}
    createQueue = mocks.createQueue;
    work = mocks.work;
    schedule = mocks.schedule;
    start = mocks.start;
    stop = mocks.stop;
  },
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ DATABASE_URL: 'postgresql://example.invalid/test' }),
}));
vi.mock('../db', () => ({ getDb: () => mocks.db }));
vi.mock('../external/storage', () => ({ getStorage: () => ({}) }));
vi.mock('../services/auth-cleanup', () => ({ purgeExpiredAuth: mocks.purgeAuth }));
vi.mock('../services/event', () => ({ detachOldEvents: mocks.detach }));
vi.mock('../services/year-alumni', () => ({ freezeDueAwardCycles: mocks.freezeAwards }));
vi.mock('../services/alumni-story', () => ({ rotateMonthlyAlumni: mocks.rotateMonthly }));
vi.mock('./notification-intent-worker', () => ({ relayPendingNotifications: vi.fn() }));
vi.mock('../services/files-purge', () => ({ purgeFiles: vi.fn() }));
vi.mock('../services/cv-parse', () => ({ purgeExpiredLinkedinFiles: mocks.purgeLinkedin }));
vi.mock('./feedback-task', () => ({ scheduleFeedbackPrompts: vi.fn() }));
vi.mock('./notification-tasks', () => ({
  alumniStillThere: vi.fn(),
  profileFreshness: vi.fn(),
  studentEmailMigration: vi.fn(),
}));
import { createNotificationRuntime } from './notification-worker';

describe('günlük bakım işlerinin kaydı', () => {
  beforeEach(() => vi.clearAllMocks());
  it('iki işi İstanbul saatinde günlük zamanlar ve gerçek bakım işlerine bağlar', async () => {
    await createNotificationRuntime();
    for (const name of ['auth.purge', 'events.detach']) {
      expect(mocks.createQueue).toHaveBeenCalledWith(name, expect.any(Object));
      expect(mocks.schedule).toHaveBeenCalledWith(
        name,
        '0 3 * * *',
        {},
        { tz: 'Europe/Istanbul', missed: 'once' },
      );
      const worker = mocks.work.mock.calls.find(([queue]) => queue === name)?.[2];
      expect(worker).toBeTypeOf('function');
      await worker();
    }
    expect(mocks.purgeAuth).toHaveBeenCalledWith(mocks.db);
    expect(mocks.detach).toHaveBeenCalledWith(mocks.db, expect.any(Date));
  });
  it('ödül listesi dondurma işini her dakika zamanlar', async () => {
    await createNotificationRuntime();
    expect(mocks.schedule).toHaveBeenCalledWith(
      'awards.freeze',
      '* * * * *',
      {},
      { tz: 'Europe/Istanbul', missed: 'once' },
    );
    const worker = mocks.work.mock.calls.find(([queue]) => queue === 'awards.freeze')?.[2];
    expect(worker).toBeTypeOf('function');
    await worker();
    expect(mocks.freezeAwards).toHaveBeenCalledWith(mocks.db);
  });
  it('LinkedIn dosyası süresini her dakika kontrol eder', async () => {
    await createNotificationRuntime();
    expect(mocks.schedule).toHaveBeenCalledWith(
      'linkedin.purge',
      '* * * * *',
      {},
      { tz: 'Europe/Istanbul', missed: 'once' },
    );
    const worker = mocks.work.mock.calls.find(([queue]) => queue === 'linkedin.purge')?.[2];
    await worker();
    expect(mocks.purgeLinkedin).toHaveBeenCalledOnce();
  });
  it('ayın mezununu İstanbul ay başında döndürür', async () => {
    await createNotificationRuntime();
    expect(mocks.schedule).toHaveBeenCalledWith(
      'alumni.monthlyRotate',
      '0 0 1 * *',
      {},
      { tz: 'Europe/Istanbul', missed: 'once' },
    );
    const worker = mocks.work.mock.calls.find(([queue]) => queue === 'alumni.monthlyRotate')?.[2];
    expect(worker).toBeTypeOf('function');
    await worker();
    expect(mocks.rotateMonthly).toHaveBeenCalledWith(mocks.db);
  });
});
