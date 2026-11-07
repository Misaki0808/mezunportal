import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';
import { createLocalStorage } from '../external/storage/local';
import { loadActor } from '../permissions/actor';
import { deleteAccount } from './accountDeletion';
import { uploadGraduationDocument } from './graduation-document';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('hesap silinirken başlayan belge yükleme reddedilir ve dosya kalmaz', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'account-race-'));
  let release!: () => void;
  let unlock!: () => void;
  const deletionLocked = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const local = createLocalStorage(root);
    let key = '';
    let wroteFile = false;
    const storage = {
      ...local,
      put: async (...args: Parameters<typeof local.put>) => {
        key = args[0];
        wroteFile = true;
        await local.put(...args);
      },
      delete: async (value: string) => {
        key = value;
        await local.delete(value);
      },
    };
    const inst = await createInstitution(db);
    const userId = await createUser(db);
    const email = `race-${randomUUID()}@example.test`;
    await db.user.update({ where: { id: userId }, data: { email } });
    const actor = await loadActor(db, userId, new Date());
    if (!actor) throw new Error('Test kullanıcısı yok');
    const deletion = deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: email },
      {
        handlers: [
          async () => {
            unlock();
            await proceed;
          },
        ],
        removeStoredFiles: async (keys) => {
          for (const item of keys) await storage.delete(item);
        },
      },
    );
    await deletionLocked;
    const file = new File([new TextEncoder().encode('%PDF-1.7\n')], 'test.pdf', {
      type: 'application/pdf',
    });
    const upload = uploadGraduationDocument({ db, storage, secret: 'test-secret' }, actor, {
      departmentId: inst.deptA1,
      graduationYear: 2024,
      file,
    }).then(
      () => 'OK',
      (error: unknown) => (isCodedError(error) ? error.code : 'UNKNOWN'),
    );
    // Yükleme gerçek PostgreSQL kilidinde bekleyene kadar silme işlemi açık kalır.
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const rows = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock') AS waiting`;
      waiting = rows[0]?.waiting ?? false;
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(waiting).toBe(true);
    release();
    await deletion;
    expect(await upload).toBe('AUTH_UNAUTHENTICATED');
    expect(wroteFile).toBe(false);
    expect(await db.graduationDocument.count({ where: { userId } })).toBe(0);
    expect(await local.get(key)).toBeNull();
  } finally {
    release();
    await rm(root, { recursive: true, force: true });
  }
});
