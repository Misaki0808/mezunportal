import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('worker modülü react-server koşulunda yan etkisiz yüklenir', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      'await import("./src/server/jobs/email-worker.ts")',
    ],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
