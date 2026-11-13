import type { PgBoss } from 'pg-boss';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden } from '@/lib/errors';

import { startCvConsumer, startCvFailureConsumer } from './cv-queue';
import { EmailTransportError } from '../external/email/types';
import { startEmailConsumer, startEmailFailureConsumer } from './email-queue';

type Handler = (jobs: unknown[]) => Promise<unknown>;

/** `boss.work(...)` çağrısındaki işleyiciyi yakalar; gerçek kuyruk gerekmez. */
function fakeBoss() {
  const handlers: Handler[] = [];
  const boss = {
    work: (...args: unknown[]) => {
      handlers.push(args.at(-1) as Handler);
      return Promise.resolve('worker');
    },
  } as unknown as PgBoss;
  return { boss, handler: () => handlers.at(-1)! };
}

const emailJob = { id: 'j1', data: { to: 'a@example.invalid' }, retryCount: 0, retryLimit: 3 };
const cvJob = { id: 'j2', data: { cvId: 'c1' }, retryCount: 0, retryLimit: 3 };
const leaky = () =>
  Object.assign(new Error('ayse@ogr.iu.edu.tr postgres://gizli'), { code: 'P2034' });

afterEach(() => vi.restoreAllMocks());
const stderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
const lines = (write: ReturnType<typeof stderr>) =>
  write.mock.calls.map(([line]) => JSON.parse(String(line).trim()));

describe('işçi görevleri: beklenmedik hata tek satır günlüğe düşer', () => {
  it('e-posta teslimi: kodsuz hata (veritabanı) `job.unexpected` yazar ve iş yine kararlı koda çevrilir', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startEmailConsumer(boss, async () => Promise.reject(leaky()));
    const result = (await handler()([emailJob])) as Array<{
      status: string;
      output: { errorCode: string };
    }>;
    expect(result[0]).toMatchObject({ id: 'j1' });
    expect(lines(write)).toEqual([
      { event: 'job.unexpected', source: 'email.send', errorName: 'Error', errorCode: 'P2034' },
    ]);
    expect(String(write.mock.calls[0]![0])).not.toMatch(/ayse|postgres|gizli/);
  });

  it('e-posta teslimi: beklenen taşıma hatası (SMTP) bu günlüğe yazılmaz (e-posta olaylarında görünür)', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startEmailConsumer(boss, async () => Promise.reject(new EmailTransportError()));
    await handler()([emailJob]);
    expect(write).not.toHaveBeenCalled();
  });

  it('e-posta teslimi: başarıda yazmaz', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startEmailConsumer(boss, async () => undefined);
    await handler()([emailJob]);
    expect(write).not.toHaveBeenCalled();
  });

  it('e-posta başarısızlık kaydı: hata günlüğe düşer ve kararlı hata aynen fırlatılır', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startEmailFailureConsumer(boss, async () => Promise.reject(leaky()));
    await expect(handler()([emailJob])).rejects.toThrow('EMAIL_FAILURE_RECORD_UNAVAILABLE');
    expect(lines(write)).toEqual([
      {
        event: 'job.unexpected',
        source: 'email.failureRecord',
        errorName: 'Error',
        errorCode: 'P2034',
      },
    ]);
  });

  it('CV ayrıştırma: beklenmeyen hata tek satır (ileti, CV ve kişisel veri yok); iş CV_PARSE_ERROR ile başarısız kalır', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startCvConsumer(boss, async () => Promise.reject(leaky()));
    const result = (await handler()([cvJob])) as Array<{
      status: string;
      output: { errorCode: string };
    }>;
    expect(result[0]).toMatchObject({
      id: 'j2',
      status: 'failed',
      output: { errorCode: 'CV_PARSE_ERROR' },
    });
    expect(lines(write)).toEqual([
      { event: 'job.unexpected', source: 'cv.parse', errorName: 'Error', errorCode: 'P2034' },
    ]);
    expect(String(write.mock.calls[0]![0])).not.toMatch(/ayse|postgres|gizli/);
  });

  it('CV ayrıştırma: kodlu hata günlüğe yazılmaz; yeniden deneme sonucu da yazmaz', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startCvConsumer(boss, async () => Promise.reject(codedForbidden('AUTH_FORBIDDEN')));
    await handler()([cvJob]);
    await startCvConsumer(boss, async () => 'RETRY');
    await handler()([cvJob]);
    expect(write).not.toHaveBeenCalled();
  });

  it('CV başarısızlık kaydı: hata günlüğe düşer ve kararlı hata fırlatılır', async () => {
    const write = stderr();
    const { boss, handler } = fakeBoss();
    await startCvFailureConsumer(boss, async () => Promise.reject(leaky()));
    await expect(handler()([cvJob])).rejects.toThrow('CV_FAILURE_RECORD_UNAVAILABLE');
    expect(lines(write)).toEqual([
      {
        event: 'job.unexpected',
        source: 'cv.failureRecord',
        errorName: 'Error',
        errorCode: 'P2034',
      },
    ]);
  });
});
