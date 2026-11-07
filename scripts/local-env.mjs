import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { parseEnv } from 'node:util';

export function worktreeSettings(name, main = false) {
  const slug = name.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
  if (!slug || slug.length > 52) throw new Error('Worktree adı 1–52 ASCII karakter olmalı.');
  const ranges = { w1: 3100, w2: 3200, r1: 3300, r2: 3400, pm: 3900 };
  const base = main ? 3000 : ranges[name.split('-')[0]];
  if (!base) throw new Error('Worktree adı rol önekiyle başlamalı (w1/w2/r1/r2/pm-).');
  const offset = main ? 0 : createHash('sha256').update(name).digest().readUInt16BE(0) % 100;
  return { database: `mezun_${slug}`, testDatabase: `mezun_${slug}_test`, base, offset };
}

export function readLocalSettings(text, expected) {
  const values = parseEnv(text);
  const app = new URL(values.APP_URL);
  if (values.APP_ENV !== 'local' || app.protocol !== 'http:') {
    throw new Error('Yalnız local HTTP ortamı desteklenir.');
  }
  const port = Number(app.port || 80);
  if (
    expected &&
    (port < expected.base || port >= expected.base + (expected.base === 3000 ? 1 : 100))
  ) {
    throw new Error('Mevcut port bu worktree rol diliminde değil; dosya korunarak duruldu.');
  }
  if (expected) {
    for (const [key, database] of [
      ['DATABASE_URL', expected.database],
      ['DATABASE_URL_TEST', expected.testDatabase],
    ]) {
      const url = new URL(values[key]);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.port !== '5432' ||
        decodeURIComponent(url.pathname.slice(1)) !== database
      ) {
        throw new Error('Mevcut veritabanı bu worktree için değil; dosya korunarak duruldu.');
      }
    }
  }
  return { values, port };
}

export async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}
