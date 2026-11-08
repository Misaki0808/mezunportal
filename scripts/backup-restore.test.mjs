import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const fakeCommand = `#!/usr/bin/env node
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify({ name, args: process.argv.slice(2), passwordOk: process.env.PGPASSWORD === 'fake:/@ secret', host: process.env.PGHOST, database: process.env.PGDATABASE, sslmode: process.env.PGSSLMODE, passfile: process.env.PGPASSFILE }) + '\\n');
if (name === 'pg_dump') process.stdout.write('fake-dump');
if (name === 'pg_restore') process.stdout.write("SELECT pg_catalog.set_config('search_path', '', false);\\n");
if (name === 'psql' && process.argv.includes('-Atqc')) process.stdout.write('0\\n');
`;
test('yedek ve geri yükleme parola ya da URL içeren argv kullanmaz', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mezun-backup-test-'));
  try {
    const bin = path.join(root, 'bin'),
      files = path.join(root, 'files'),
      log = path.join(root, 'calls');
    await mkdir(bin);
    await mkdir(files);
    for (const name of ['pg_dump', 'pg_restore', 'psql']) {
      const file = path.join(bin, name);
      await writeFile(file, fakeCommand);
      await chmod(file, 0o700);
    }
    const uri =
      'postgresql://fake-user:fake%3A%2F%40%20secret@db.example.invalid:5432/sample?sslmode=require&schema=public';
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_CALLS: log,
      PGPASSFILE: '/tmp/fake-passfile',
      DATABASE_URL: uri,
      STORAGE_LOCAL_PATH: files,
      RESTORE_DATABASE_URL:
        'postgresql://fake-user:fake%3A%2F%40%20secret@db.example.invalid:5432/restore?sslmode=require',
      RESTORE_STORAGE_PATH: path.join(root, 'restored'),
    };
    const backup = spawnSync('sh', ['scripts/backup.sh', path.join(root, 'archive')], {
      env,
      encoding: 'utf8',
    });
    assert.equal(backup.status, 0, 'yedek komutu tamamlanmalı');
    const restore = spawnSync('sh', ['scripts/restore.sh', path.join(root, 'archive')], {
      env,
      encoding: 'utf8',
    });
    assert.equal(restore.status, 0, 'geri yükleme komutu tamamlanmalı');
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    for (const call of calls)
      assert.equal(
        call.args.some(
          (arg) =>
            arg.includes('fake%3A%2F%40%20secret') ||
            arg.includes('fake:/@ secret') ||
            arg.includes('postgresql://'),
        ),
        false,
        `${call.name} argv gizli veri içeriyor`,
      );
    for (const call of calls.filter((entry) => entry.name === 'psql' || entry.name === 'pg_dump')) {
      assert.equal(call.passwordOk, true);
      assert.equal(call.host, 'db.example.invalid');
      assert.equal(call.sslmode, 'require');
      assert.equal(call.passfile, '/tmp/fake-passfile');
      assert.equal(call.database, call.name === 'pg_dump' ? 'sample' : 'restore');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desteklenmeyen bağlantı seçeneği güvenli biçimde reddedilir', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/postgres-connection.mjs', 'source', 'pg_dump'],
    {
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://fake:fake-secret@db.example.invalid/db?unknown=1',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.equal(`${result.stdout}${result.stderr}`.includes('fake-secret'), false);
});
