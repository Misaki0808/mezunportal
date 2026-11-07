import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import {
  envReservations,
  portAvailable,
  readLocalSettings,
  worktreeSettings,
} from './local-env.mjs';

// Kullanıcıya gösterilebilen, değer/sır içermeyen sabit hatalar.
class SetupError extends Error {}
// Betik normalde birkaç saniyede biter; bu yaştaki kilit ölmüş bir koşudan kalmıştır.
const STALE_LOCK_MS = 60_000;

const root = realpathSync(process.cwd());
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const mainRoot = dirname(resolve(git('rev-parse', '--git-common-dir')));
const settings = worktreeSettings(basename(root), root === mainRoot);
const lock = join(tmpdir(), `mezunportal-env-${process.getuid()}.lock`);
let locked = false;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      locked = true;
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* kilit bu arada kalktı; yeniden dene */
      }
      await setTimeout(100);
    }
  }
  if (!locked) {
    throw new SetupError(
      `Ortam hazırlama kilidi dolu (${lock}); başka bir worktree-env koşusu bitince yeniden dene.`,
    );
  }
  const file = join(root, '.env.local');
  let port;
  let content;
  if (existsSync(file)) {
    ({ port } = readLocalSettings(readFileSync(file, 'utf8'), settings));
  } else {
    const reserved = new Set();
    const reservedDatabases = new Set();
    const paths = git('worktree', 'list', '--porcelain')
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice(9));
    // Aynı rolün henüz Git'e kaydedilmemiş test kopyalarını da korur.
    for (const entry of readdirSync(dirname(root), { withFileTypes: true })) {
      if (entry.isDirectory()) paths.push(join(dirname(root), entry.name));
    }
    for (const path of paths) {
      const envFile = join(path, '.env.local');
      if (resolve(path) === root || !existsSync(envFile)) continue;
      // İlgisiz/eksik ortam dosyası değiştirilmez; okunabilen ayrımlar korunur.
      const { port: taken, databases } = envReservations(readFileSync(envFile, 'utf8'));
      if (taken) reserved.add(taken);
      for (const database of databases) reservedDatabases.add(database);
    }
    for (const database of [settings.database, settings.testDatabase]) {
      if (reservedDatabases.has(database)) {
        throw new SetupError(
          `${database} başka bir worktree'nin .env.local dosyasında kullanılıyor (klasör adı aynı ada ` +
            "dönüşüyor); bu worktree'yi farklı adla aç.",
        );
      }
    }
    for (let index = 0; index < (settings.base === 3000 ? 1 : 100); index++) {
      const candidate = settings.base + ((settings.offset + index) % 100);
      if (!reserved.has(candidate) && (await portAvailable(candidate))) {
        port = candidate;
        break;
      }
    }
    if (!port) throw new Error('Rol diliminde boş port bulunamadı.');
    content = readFileSync('.env.example', 'utf8')
      .replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${port}`)
      .replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL=postgresql://mezun:mezun@127.0.0.1:5432/${settings.database}`,
      )
      .replace(
        /^DATABASE_URL_TEST=.*$/m,
        `DATABASE_URL_TEST=postgresql://mezun:mezun@127.0.0.1:5432/${settings.testDatabase}`,
      );
  }
  for (const database of [settings.database, settings.testDatabase]) {
    const args = ['compose', '-p', 'mezunportal', 'exec', '-T', 'postgres'];
    const found = execFileSync(
      'docker',
      [
        ...args,
        'psql',
        '-U',
        'mezun',
        '-d',
        'postgres',
        '-Atc',
        `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (found !== '1')
      execFileSync('docker', [...args, 'createdb', '-U', 'mezun', database], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
  }
  if (content) writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
  mkdirSync('.data/files', { recursive: true });
  process.stdout.write(
    `Yerel ortam hazır: ${settings.database}, ${settings.testDatabase}; port ${port}. Mevcut ayar ve veri korundu.\n`,
  );
} catch (error) {
  if (error instanceof SetupError) {
    process.stderr.write(`Yerel ortam hazırlanamadı: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(
      'Yerel ortam hazırlanamadı. Worktree adı/ayarı, boş rol portu ve Docker PostgreSQL durumunu kontrol et; mevcut .env.local korunur.\n',
    );
    process.exitCode = 1;
  }
} finally {
  if (locked) rmSync(lock, { recursive: true });
}
