import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('randevu bildirimi bağımsız react-server worker sürecinde React istemci API gerektirmez', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--conditions=react-server',
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `await import('./src/server/jobs/appointment.ts');
   const {buildAppointmentEmail}=await import('./src/server/services/appointment-notifier.ts');
   const email=buildAppointmentEmail({event:'confirmed',appointmentId:'worker-proof',recipient:{userId:'recipient',email:'example@example.invalid'},counterpartName:'Deneme',startsAt:new Date('2030-06-17T06:00:00Z'),mode:'ONLINE',withReminder:true});
   process.stdout.write(JSON.stringify({subject:email.subject,complete:!email.text.includes('{when}'),reminder:email.text.includes('24 saat')}));`,
    ],
    { encoding: 'utf8', timeout: 10000 },
  );
  expect(JSON.parse(output)).toEqual({
    subject: 'Randevun onaylandı',
    complete: true,
    reminder: true,
  });
});
