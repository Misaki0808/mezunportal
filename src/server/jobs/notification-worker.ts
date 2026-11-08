import 'server-only';
import { PgBoss } from 'pg-boss';
import { getEnv } from '@/lib/env';
import { getDb } from '../db';
import { getStorage } from '../external/storage';
import { relayPendingNotifications } from './notification-intent-worker';
import { purgeFiles } from '../services/files-purge';
import { scheduleFeedbackPrompts } from './feedback-task';
import { alumniStillThere, profileFreshness, studentEmailMigration } from './notification-tasks';

/** Görev adları dışında kişi, bağlantı ve sağlayıcı hata bilgisi günlüğe yazılmaz. */
export async function createNotificationRuntime() {
  const boss = new PgBoss({
    connectionString: getEnv().DATABASE_URL,
    max: 4,
    schedule: true,
    supervise: true,
    persistWarnings: false,
  });
  boss.on('error', () => process.stderr.write('notifications.queue: unavailable\n'));
  const tasks = {
    'profile.freshness': () => profileFreshness(getDb()),
    'alumni.stillThere': () => alumniStillThere(getDb()),
    'student.emailMigration': () => studentEmailMigration(getDb()),
    'notification.relay': () => relayPendingNotifications(),
    'files.purge': () => purgeFiles(getDb(), getStorage()),
    'appointment.feedback': () => scheduleFeedbackPrompts(getDb()),
  };
  try {
    await boss.start();
    for (const [name, task] of Object.entries(tasks)) {
      await boss.createQueue(name, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
      await boss.work(name, { batchSize: 1 }, async () => {
        await task();
      });
      await boss.schedule(
        name,
        ['notification.relay', 'appointment.feedback'].includes(name) ? '* * * * *' : '0 3 * * *',
        {},
        { tz: 'Europe/Istanbul', missed: 'once' },
      );
    }
    return { stop: () => boss.stop({ graceful: true, timeout: 15_000 }) };
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error('NOTIFICATION_WORKER_UNAVAILABLE');
  }
}
