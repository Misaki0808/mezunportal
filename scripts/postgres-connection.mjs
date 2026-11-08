// PostgreSQL URI'sini hiçbir çocuk süreç argümanına koymadan libpq ortamına aktarır.
import { spawnSync } from 'node:child_process';

const [source, program, ...args] = process.argv.slice(2);
const raw =
  source === 'source'
    ? process.env.DATABASE_URL
    : source === 'target'
      ? process.env.RESTORE_DATABASE_URL
      : undefined;
const supported = {
  host: 'PGHOST',
  hostaddr: 'PGHOSTADDR',
  port: 'PGPORT',
  dbname: 'PGDATABASE',
  user: 'PGUSER',
  password: 'PGPASSWORD',
  sslmode: 'PGSSLMODE',
  sslcert: 'PGSSLCERT',
  sslkey: 'PGSSLKEY',
  sslrootcert: 'PGSSLROOTCERT',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslsni: 'PGSSLSNI',
  ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION',
  ssl_max_protocol_version: 'PGSSLMAXPROTOCOLVERSION',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  application_name: 'PGAPPNAME',
  options: 'PGOPTIONS',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
  gssencmode: 'PGGSSENCMODE',
  channel_binding: 'PGCHANNELBINDING',
  service: 'PGSERVICE',
  passfile: 'PGPASSFILE',
};
try {
  if (!raw || !['pg_dump', 'psql'].includes(program)) throw new Error();
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error();
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.RESTORE_DATABASE_URL;
  if (url.hostname) env.PGHOST = decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ''));
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  if (url.pathname.length > 1) env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  for (const [key, value] of url.searchParams) {
    // Prisma'nın şema seçeneği libpq'ya ait değildir; yedek her zaman tüm veritabanını kapsar.
    if (key === 'schema') continue;
    if (!Object.hasOwn(supported, key)) throw new Error();
    env[supported[key]] = value;
  }
  const result = spawnSync(program, args, { env, stdio: 'inherit' });
  if (result.error || result.status === null) throw new Error();
  process.exitCode = result.status;
} catch {
  process.stderr.write('PostgreSQL bağlantısı veya komutu geçersiz.\n');
  process.exitCode = 1;
}
