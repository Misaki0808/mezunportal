import 'server-only';

import { PgBoss } from 'pg-boss';

import { getEnv } from '@/lib/env';

import { getDb } from '../db';
import { getCalendar } from '../external/calendar';
import { createAppointmentNotifier } from '../services/appointment-notifier';
import { runAppointmentSweep } from '../services/appointment-jobs';
import { enqueueEmail } from './email';
import { loggedJob } from '../unexpected-log';

/**
 * `appointment.sweep` (pg-boss, dakikada bir): yanıt süresi (D11) dolan talepleri kapatır, onaylı online randevulara
 * takvim etkinliği ister (en çok 3 deneme, sonra mentor elle link ekler), iptal edilmiş etkinlikleri siler,
 * 24 saat kala hatırlatma gönderir. Adımların hepsi tekrar çalıştırılabilir ve satır kilitlidir; üst üste binen ya da
 * yinelenen çalıştırma çift etkinlik/bildirim üretmez (bildirim anahtarı olay+randevu+alıcıdır).
 */
export const APPOINTMENT_SWEEP_QUEUE = 'appointment.sweep';
export const APPOINTMENT_SWEEP_CRON = '* * * * *';

export async function createAppointmentRuntime(
  consume = false,
  options: { schema?: string; connectionString?: string } = {},
) {
  const boss = new PgBoss({
    connectionString: options.connectionString ?? getEnv().DATABASE_URL,
    schema: options.schema ?? 'pgboss',
    max: 3,
    schedule: consume,
    supervise: consume,
    persistWarnings: false,
  });
  // Sürücü hata nesnesi bağlantı adresi taşıyabilir; yalnız sabit metin yazılır.
  boss.on('error', () => process.stderr.write('appointment.queue: unavailable\n'));
  try {
    await boss.start();
    await boss.createQueue(APPOINTMENT_SWEEP_QUEUE, {
      retryLimit: 0,
      expireInSeconds: 120,
      retentionSeconds: 600,
      deleteAfterSeconds: 60,
    });
    if (consume) {
      await boss.schedule(APPOINTMENT_SWEEP_QUEUE, APPOINTMENT_SWEEP_CRON, {});
      await boss.work(
        APPOINTMENT_SWEEP_QUEUE,
        { pollingIntervalSeconds: 5, batchSize: 1 },
        async () => {
          await loggedJob('appointment.sweep', () =>
            runAppointmentSweep({
              db: getDb(),
              calendar: getCalendar(),
              notifier: createAppointmentNotifier(enqueueEmail),
            }),
          );
        },
      );
    }
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error('APPOINTMENT_WORKER_UNAVAILABLE');
  }
  return {
    boss,
    async stop() {
      await boss.stop({ graceful: true, timeout: 15000 });
    },
  };
}
