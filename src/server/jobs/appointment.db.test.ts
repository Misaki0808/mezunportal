import { afterAll, describe, expect, it } from 'vitest';

import {
  APPOINTMENT_SWEEP_CRON,
  APPOINTMENT_SWEEP_QUEUE,
  createAppointmentRuntime,
} from './appointment';

let runtime: Awaited<ReturnType<typeof createAppointmentRuntime>> | undefined;
afterAll(async () => {
  await runtime?.stop();
});

describe('appointment.sweep çalışma zamanı', () => {
  it('kuyruğu açar ve dakikalık zamanlamayı kaydeder (tüketici kipinde)', async () => {
    runtime = await createAppointmentRuntime(true, {
      schema: 'pgboss_appointment_test',
      connectionString: process.env.DATABASE_URL_TEST!,
    });
    const schedules = await runtime.boss.getSchedules();
    expect(
      schedules.some(
        (s) => s.name === APPOINTMENT_SWEEP_QUEUE && s.cron === APPOINTMENT_SWEEP_CRON,
      ),
    ).toBe(true);
    const queue = await runtime.boss.getQueue(APPOINTMENT_SWEEP_QUEUE);
    expect(queue?.retryLimit).toBe(0);
  });
});
