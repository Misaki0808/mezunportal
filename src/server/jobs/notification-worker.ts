import 'server-only';
import { PgBoss } from 'pg-boss';
import { getEnv } from '@/lib/env';
import { getDb } from '../db';
import { getStorage } from '../external/storage';
import { expireRequests } from '../services/cv-review-request';
import { createCvReviewNotifier } from '../services/cv-review-notifier';
import { relayPendingNotifications } from './notification-intent-worker';
import { purgeFiles } from '../services/files-purge';
import { runDailyPoints } from '../services/points';
import { runSuspicionScan } from '../services/points-scan';
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
    'cvReview.expire': () =>
      expireRequests({
        db: getDb(),
        storage: getStorage(),
        notify: createCvReviewNotifier(getDb()),
      }),
    'notification.relay': () => relayPendingNotifications(),
    'files.purge': () => purgeFiles(getDb(), getStorage()),
    'appointment.feedback': () => scheduleFeedbackPrompts(getDb()),
    // Puan motoru (P1-16): gecikmesi dolanı kesinleştir + son 14 günde kaçırılan puanı tamamla; şüphe taraması.
    'points.finalize': () => runDailyPoints({ db: getDb() }),
    'points.suspicionScan': () => runSuspicionScan({ db: getDb() }),
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
        ['notification.relay', 'appointment.feedback', 'cvReview.expire'].includes(name)
          ? '* * * * *'
          : '0 3 * * *',
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
