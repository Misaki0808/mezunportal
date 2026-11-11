import { spawnSync } from 'node:child_process';
import { beforeAll, expect, it } from 'vitest';

import {
  SUBPROCESS_TEST_TIMEOUT_MS,
  SUBPROCESS_TIMEOUT_MS,
  warmUpSubprocess,
} from '@/test/subprocess';

beforeAll(warmUpSubprocess, SUBPROCESS_TEST_TIMEOUT_MS);

it(
  'worker modülü react-server koşulunda yan etkisiz yüklenir',
  () => {
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
      { cwd: process.cwd(), encoding: 'utf8', timeout: SUBPROCESS_TIMEOUT_MS },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  },
  SUBPROCESS_TEST_TIMEOUT_MS,
);
