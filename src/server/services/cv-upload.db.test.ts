import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, grantTransferConsent, pdfForm, rawForm } from '@/test/cv';

import { getCvAvailability, getLatestCv, uploadCv } from './cv';
import { processCvParse } from './cv-parse';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code})`).toBe(true);
  expect(isCodedError(error) && error.code).toBe(code);
  return error;
}

const count = (userId: string) => db.cvUpload.count({ where: { userId } });
const remaining = async (
  kit: ReturnType<typeof cvKit>,
  actor: Parameters<typeof getCvAvailability>[1],
) => (await getCvAvailability(kit.deps, actor)).remainingToday;

describe('uploadCv — önkoşullar', () => {
  it('yurt dışı aktarım rızası yoksa reddeder: dosya yazılmaz, kuyruğa iş girmez, günlük hak harcanmaz', async () => {
    const { userId, actor } = await cvUser(db, { consent: false });
    const kit = cvKit(db, { dailyLimit: 3 });
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'CV_TRANSFER_CONSENT_REQUIRED');
    expect(await count(userId)).toBe(0);
    expect(kit.storage.files.size).toBe(0);
    expect(kit.queued).toEqual([]);
    expect(await remaining(kit, actor)).toBe(3);
  });

  it('geri çekilmiş rıza (son karar = reddetti) ve eski sürümlü rıza da yok sayılır', async () => {
    const withdrawn = await cvUser(db);
    await grantTransferConsent(db, withdrawn.userId, { granted: false });
    const outdated = await cvUser(db, { consent: false });
    await grantTransferConsent(db, outdated.userId, { version: 'taslak-0' });
    const kit = cvKit(db);
    await expectCode(
      uploadCv(kit.deps, withdrawn.actor, pdfForm()),
      'CV_TRANSFER_CONSENT_REQUIRED',
    );
    await expectCode(uploadCv(kit.deps, outdated.actor, pdfForm()), 'CV_TRANSFER_CONSENT_REQUIRED');
    expect(kit.storage.files.size).toBe(0);
  });

  it('sağlayıcı yapılandırılmamışsa (llm = null) CV_PROVIDER_NOT_CONFIGURED; kullanılabilirlik sebebi söyler', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db, { llm: null });
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'CV_PROVIDER_NOT_CONFIGURED');
    expect(await count(userId)).toBe(0);
    expect(await getCvAvailability(kit.deps, actor)).toMatchObject({
      available: false,
      reason: 'PROVIDER_NOT_CONFIGURED',
    });
  });

  it('kullanılabilirlik: rıza yoksa TRANSFER_CONSENT_REQUIRED, her şey tamamsa available', async () => {
    const without = await cvUser(db, { consent: false });
    const ready = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: 4 });
    expect(await getCvAvailability(kit.deps, without.actor)).toMatchObject({
      available: false,
      reason: 'TRANSFER_CONSENT_REQUIRED',
    });
    expect(await getCvAvailability(kit.deps, ready.actor)).toEqual({
      available: true,
      reason: null,
      dailyLimit: 4,
      remainingToday: 4,
    });
  });
});

describe('uploadCv — dosya içeriği sunucuda yeniden doğrulanır', () => {
  const cases: [string, () => ReturnType<typeof pdfForm>, string][] = [
    [
      'PDF olmayan içerik (MIME PDF diyor)',
      () => rawForm(new TextEncoder().encode('MZ-exe')),
      'DOCUMENT_NOT_PDF',
    ],
    ['boş dosya', () => rawForm(new Uint8Array()), 'DOCUMENT_EMPTY'],
    ['7 sayfa', () => pdfForm({ pages: 7 }), 'CV_TOO_MANY_PAGES'],
    ['şifreli PDF', () => pdfForm({ encrypted: true }), 'CV_PDF_UNREADABLE'],
    ['5 MB üstü', () => pdfForm({ padBytes: 5 * 1024 * 1024 }), 'DOCUMENT_TOO_LARGE'],
  ];

  it.each(cases)(
    '%s reddedilir; depoya yazılmaz, kayıt açılmaz, günlük hak harcanmaz',
    async (_name, form, code) => {
      const { userId, actor } = await cvUser(db);
      const kit = cvKit(db, { dailyLimit: 5 });
      await expectCode(uploadCv(kit.deps, actor, form()), code);
      expect(await count(userId)).toBe(0);
      expect(kit.storage.files.size).toBe(0);
      expect(kit.queued).toEqual([]);
      expect(await remaining(kit, actor)).toBe(5);
    },
  );
});

describe('uploadCv — başarı yolu', () => {
  it('dosya depoya yazılır, QUEUED kayıt açılır, iş AYNI işlemde kuyruğa girer; LLM çağrılmaz', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: 5 });
    const result = await uploadCv(kit.deps, actor, pdfForm({ pages: 2 }));
    expect(result.status).toBe('QUEUED');
    const row = await db.cvUpload.findUniqueOrThrow({ where: { id: result.cvUploadId } });
    expect(row).toMatchObject({
      userId,
      status: 'QUEUED',
      pageCount: 2,
      parsedJson: null,
      errorCode: null,
    });
    expect(row.storageKey).toMatch(new RegExp(`^cv/${userId}/[0-9a-f-]+\\.pdf$`));
    expect(kit.storage.files.has(row.storageKey!)).toBe(true);
    expect(kit.queued).toEqual([result.cvUploadId]);
    expect(kit.llm.calls).toBe(0);
    expect(await remaining(kit, actor)).toBe(4);
    expect(await getLatestCv(kit.deps, actor)).toMatchObject({
      cvUploadId: result.cvUploadId,
      status: 'QUEUED',
    });
  });

  it('kuyruğa yazma başarısızsa kayıt ve dosya geri alınır; kullanıcı CV_PARSE_UNAVAILABLE görür', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db);
    kit.failEnqueue.value = true;
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'CV_PARSE_UNAVAILABLE');
    expect(await count(userId)).toBe(0);
    expect(kit.storage.files.size).toBe(0);
  });

  it('işlenen CV varken ikinci yükleme CV_ALREADY_PROCESSING; günlük hak harcanmaz', async () => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: 5 });
    await uploadCv(kit.deps, actor, pdfForm());
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'CV_ALREADY_PROCESSING');
    expect(await remaining(kit, actor)).toBe(4);
    expect(kit.storage.files.size).toBe(1);
    expect(await getCvAvailability(kit.deps, actor)).toMatchObject({
      reason: 'ALREADY_PROCESSING',
    });
  });

  it('eşzamanlı iki yüklemeden yalnız biri kabul edilir (kısmi benzersiz indeks); fazla dosya kalmaz', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: 50 });
    const outcomes = await Promise.allSettled([
      uploadCv(kit.deps, actor, pdfForm()),
      uploadCv(kit.deps, actor, pdfForm()),
      uploadCv(kit.deps, actor, pdfForm()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(isCodedError(outcome.reason) && outcome.reason.code).toBe('CV_ALREADY_PROCESSING');
      }
    }
    expect(await count(userId)).toBe(1);
    expect(kit.storage.files.size).toBe(1);
  });

  it('silinmiş hesap yükleyemez; dosya bırakılmaz', async () => {
    const { userId, actor } = await cvUser(db);
    await db.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    const kit = cvKit(db);
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'AUTH_UNAUTHENTICATED');
    expect(kit.storage.files.size).toBe(0);
    expect(await count(userId)).toBe(0);
  });

  it('onay bekleyen eski sonuç, yeni yüklemede atılır: çıktı temizlenir, eski dosya silinir', async () => {
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db);
    const first = await uploadCv(kit.deps, actor, pdfForm({ scenario: 'ornek-ayse' }));
    await processCvParse(kit.deps, first.cvUploadId, { retryCount: 0, retryLimit: 2 });
    const parsed = await db.cvUpload.findUniqueOrThrow({ where: { id: first.cvUploadId } });
    expect(parsed.status).toBe('PARSED');
    const second = await uploadCv(kit.deps, actor, pdfForm({ scenario: 'ornek-ayse' }));
    const old = await db.cvUpload.findUniqueOrThrow({ where: { id: first.cvUploadId } });
    expect(old).toMatchObject({ status: 'DISCARDED', parsedJson: null, storageKey: null });
    expect(kit.storage.files.has(parsed.storageKey!)).toBe(false);
    expect(kit.storage.files.size).toBe(1);
    expect(second.cvUploadId).not.toBe(first.cvUploadId);
    expect(await count(userId)).toBe(2);
  });
});

describe('uploadCv — kullanıcı başına günlük sınır', () => {
  it('sınır dolunca CV_DAILY_LIMIT_REACHED (sınır parametresiyle); başka kullanıcı etkilenmez; kullanılabilirlik sebebi söyler', async () => {
    const limit = 2;
    const a = await cvUser(db);
    const b = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: limit });
    for (let index = 0; index < limit; index += 1) {
      const upload = await uploadCv(kit.deps, a.actor, pdfForm({ scenario: 'empty' }));
      // Sonuçlansın (FAILED) ki bir sonraki yükleme "işleniyor" engeline takılmasın.
      await processCvParse(kit.deps, upload.cvUploadId, { retryCount: 0, retryLimit: 2 });
    }
    const error = await expectCode(
      uploadCv(kit.deps, a.actor, pdfForm()),
      'CV_DAILY_LIMIT_REACHED',
    );
    expect(isCodedError(error) && error.params).toEqual({ limit });
    expect(await getCvAvailability(kit.deps, a.actor)).toMatchObject({
      available: false,
      reason: 'DAILY_LIMIT_REACHED',
      remainingToday: 0,
    });
    // Reddedilen yükleme dosya ya da kayıt bırakmaz.
    expect(await count(a.userId)).toBe(limit);
    // Başka kullanıcının hakkı ayrıdır.
    await uploadCv(kit.deps, b.actor, pdfForm());
  });

  it('pencere dolunca (24 saat sonra) hak yeniden açılır', async () => {
    const { actor } = await cvUser(db);
    let now = new Date('2030-01-01T10:00:00Z');
    const kit = cvKit(db, { dailyLimit: 1, now: () => now });
    const first = await uploadCv(kit.deps, actor, pdfForm({ scenario: 'empty' }));
    await processCvParse(kit.deps, first.cvUploadId, { retryCount: 0, retryLimit: 2 });
    await expectCode(uploadCv(kit.deps, actor, pdfForm()), 'CV_DAILY_LIMIT_REACHED');
    now = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1000);
    await uploadCv(kit.deps, actor, pdfForm());
  });

  it('PDF doğrulaması günlük hakkı harcamaz, geçerli yükleme harcar (tam bir hak)', async () => {
    const { actor } = await cvUser(db);
    const kit = cvKit(db, { dailyLimit: 1 });
    for (let index = 0; index < 3; index += 1) {
      await expectCode(uploadCv(kit.deps, actor, pdfForm({ pages: 9 })), 'CV_TOO_MANY_PAGES');
    }
    await uploadCv(kit.deps, actor, pdfForm());
    expect(await remaining(kit, actor)).toBe(0);
  });
});
