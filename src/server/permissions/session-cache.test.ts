import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('gerçek React sunucu isteklerinde oturumu istek başına bir kez çözer, kullanıcılar arasında paylaşmaz', () => {
  const output = execFileSync(
    process.execPath,
    ['--conditions=react-server', '--import=tsx', 'src/test/helpers/session-cache-probe.mjs'],
    { encoding: 'utf8', timeout: 10_000 },
  );
  expect(JSON.parse(output)).toEqual([
    { id: 'first-user', calls: 1, correctUser: true },
    { id: 'second-user', calls: 2, correctUser: true },
  ]);
});
