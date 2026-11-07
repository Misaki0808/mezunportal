import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import {
  envReservations,
  portAvailable,
  readLocalSettings,
  worktreeSettings,
} from './local-env.mjs';

test('veritabanları worktree adından gelir; rol dilimleri ve ana kopya sabittir', () => {
  for (const [role, base] of [
    ['w1', 3100],
    ['w2', 3200],
    ['r1', 3300],
    ['r2', 3400],
    ['pm', 3900],
  ]) {
    const result = worktreeSettings(`${role}-p0-04`);
    assert.equal(result.database, `mezun_${role}_p0_04`);
    assert.equal(result.testDatabase, `mezun_${role}_p0_04_test`);
    assert.equal(result.base, base);
    assert.deepEqual(result, worktreeSettings(`${role}-p0-04`));
    assert.ok(result.offset >= 0 && result.offset < 100);
  }
  assert.equal(worktreeSettings('mezunportal', true).base, 3000);
  assert.throws(() => worktreeSettings('unknown-copy'));
  assert.throws(() => worktreeSettings(`r2-${'a'.repeat(60)}`));
});

test('mevcut env worktree dışındaki veritabanına veya porta yönlendiremez', () => {
  const expected = worktreeSettings('r2-p0-04');
  const text =
    'APP_ENV=local\nAPP_URL=http://localhost:3440\nDATABASE_URL=postgresql://mezun:mezun@127.0.0.1:5432/mezun_r2_p0_04\nDATABASE_URL_TEST=postgresql://mezun:mezun@127.0.0.1:5432/mezun_r2_p0_04_test\n';
  assert.equal(readLocalSettings(text, expected).port, 3440);
  assert.throws(() => readLocalSettings(text.replace('3440', '3000'), expected));
  assert.throws(() =>
    readLocalSettings(text.replaceAll('mezun_r2_p0_04', 'mezun_w1_p0_04'), expected),
  );
  assert.throws(() => readLocalSettings(text.replace('APP_ENV=local', 'APP_ENV=prod'), expected));
  assert.throws(() => readLocalSettings(text.replaceAll('127.0.0.1', 'db.example.org'), expected));
});

test('dolu port seçilemez; kapanan port yeniden kullanılabilir', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  try {
    const port = server.address().port;
    assert.equal(await portAvailable(port), false);
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await portAvailable(port), true);
  } finally {
    if (server.listening) server.close();
  }
});

test('veritabanı adı yalnız [a-z0-9_]; boşluk, tırnak, ; ve Türkçe harf kaçışlanır', () => {
  for (const name of [
    'r1-a b',
    "r1-x';DROP DATABASE mezun_w1_p0_02;--",
    'r1-$(rm -rf ~)',
    'r1-a"b',
    'r1-a\\b',
    'r1-İğüşöç',
    'r1-p0-04\nDATABASE_URL=x',
  ]) {
    const { database, testDatabase } = worktreeSettings(name);
    assert.match(database, /^mezun_[a-z0-9_]+$/, name);
    assert.equal(testDatabase, `${database}_test`);
  }
});

test('başka worktree ayarındaki port ve veritabanı adları okunur; bozuk dosya boş ayrımdır', () => {
  const text =
    'APP_ENV=local\nAPP_URL=http://localhost:3372\nDATABASE_URL=postgresql://mezun:mezun@127.0.0.1:5432/mezun_r1_a_b\nDATABASE_URL_TEST=postgresql://mezun:mezun@127.0.0.1:5432/mezun_r1_a_b_test\n';
  assert.deepEqual(envReservations(text), {
    port: 3372,
    databases: ['mezun_r1_a_b', 'mezun_r1_a_b_test'],
  });
  // Farklı klasör adları aynı veritabanına dönüşebilir: çakışma bu ayrımla yakalanır.
  assert.equal(worktreeSettings('r1-a b').database, worktreeSettings('r1-a_b').database);
  assert.ok(envReservations(text).databases.includes(worktreeSettings('r1-a"b').database));
  assert.deepEqual(envReservations('APP_URL=bozuk\n'), { port: undefined, databases: [] });
});
