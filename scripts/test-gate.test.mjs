import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, parseUnhandled, planRetry, unhandledInfraFiles } from './test-gate.mjs';

const file = (name, status, message, failures = []) => ({
  name,
  status,
  message,
  assertionResults: failures.map((failureMessages) => ({ status: 'failed', failureMessages })),
});

test('yalnız işçi zaman aşımı mesajı taşıyan dosya altyapı sayılır', () => {
  const report = {
    testResults: [
      file('/a.test.ts', 'passed', ''),
      file('/b.test.ts', 'failed', '[vitest-pool-runner]: Timeout waiting for worker to respond'),
      file('/c.test.ts', 'failed', '', [['[vitest-pool]: Timeout starting forks runner.']]),
    ],
  };
  assert.deepEqual(classify(report), { infraFiles: ['/b.test.ts', '/c.test.ts'], real: 0 });
});

test('gerçek assert hatası ya da karışık mesaj ASLA altyapı sayılmaz (yeniden deneme hatayı gizlemez)', () => {
  const report = {
    testResults: [
      file('/real.test.ts', 'failed', '', [['AssertionError: expected 1 to be 2']]),
      file('/mixed.test.ts', 'failed', '', [
        ['[vitest-pool-runner]: Timeout waiting for worker to respond'],
        ['AssertionError: boom'],
      ]),
      file('/empty.test.ts', 'failed', ''),
    ],
  };
  assert.deepEqual(classify(report), { infraFiles: [], real: 3 });
});

test('boş ya da bozuk rapor düşen dosya üretmez; sınıflandırma çökmez', () => {
  assert.deepEqual(classify(null), { infraFiles: [], real: 0 });
  assert.deepEqual(classify({}), { infraFiles: [], real: 0 });
  assert.deepEqual(classify({ testResults: [{ name: '/x', status: 'passed' }] }), {
    infraFiles: [],
    real: 0,
  });
});

// --- Yakalanmamış hata biçimi (dosya GEÇTİ ama işçi başlatılamadı; JSON raporunda yoktur, yalnız metin çıktısındadır) ---

const ROOT = process.cwd();
const BAR = '⎯'.repeat(6);
const workerTimeout = (path) =>
  `Error: [vitest-pool]: Failed to start forks worker for test files ${path}.\nCaused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond\n ❯ node_modules/vitest/dist/chunks/pool.js:1:1`;

/** Vitest varsayılan raporlayıcısının metin çıktısını taklit eder (renk kodlarıyla). */
function vitestText(blocks, { claimed = blocks.length, reported = blocks.length } = {}) {
  const body = blocks
    .map(
      (block) =>
        `\x1b[31m${BAR} Unhandled Error ${BAR}\x1b[39m\n${block}\n\nThis error originated in "x" test file.\n`,
    )
    .join('\n');
  return [
    ` ✓ |unit| src/a.test.ts (1 test) 5ms`,
    `${BAR} Unhandled Errors ${BAR}`,
    '',
    `Vitest caught ${claimed} unhandled error${claimed === 1 ? '' : 's'} during the test run.`,
    'This might cause false positive tests.',
    '',
    body,
    '⎯'.repeat(30),
    '',
    '',
    ' Test Files  327 passed (327)',
    '      Tests  4299 passed (4299)',
    `     Errors  ${reported} error${reported === 1 ? '' : 's'}`,
    '',
  ].join('\n');
}
const passedReport = { success: true, testResults: [{ name: '/a.test.ts', status: 'passed' }] };

test('PM vakası: dosyalar geçti, çıkış 1, tek işçi başlatma zaman aşımı → yalnız o dosya bir kez yeniden koşulur', () => {
  const text = vitestText([workerTimeout(`${ROOT}/src/components/ui/display.test.tsx`)]);
  const parsed = parseUnhandled(text);
  assert.equal(parsed.trusted, true);
  assert.equal(parsed.blocks.length, 1);
  assert.ok(parsed.blocks[0].startsWith('Error: [vitest-pool]: Failed to start forks worker'));
  assert.deepEqual(unhandledInfraFiles(text), { files: ['src/components/ui/display.test.tsx'] });
  assert.deepEqual(planRetry({ code: 1, report: passedReport, text }), [
    'src/components/ui/display.test.tsx',
  ]);
});

test('kalıba uymayan TEK yakalanmamış hata (altyapı hatasıyla yan yana bile) kapıyı kırmızı bırakır', () => {
  const text = vitestText([
    workerTimeout(`${ROOT}/src/a.test.ts`),
    "TypeError: Cannot read properties of undefined (reading 'x')\n ❯ src/b.ts:1:1",
  ]);
  assert.equal(unhandledInfraFiles(text), null);
  assert.equal(planRetry({ code: 1, report: passedReport, text }), null);
});

test('dosya yolu çıkarılamayan ya da başlatma + zaman aşımı kalıbının yarısı olan hata yeniden denenmez', () => {
  const noPath = vitestText([
    'Error: [vitest-pool]: Failed to start forks worker for test files <bilinmiyor>.\nCaused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond',
  ]);
  const noCause = vitestText([
    `Error: [vitest-pool]: Failed to start forks worker for test files ${ROOT}/src/a.test.ts.\nCaused by: Error: spawn ENOENT`,
  ]);
  const noStart = vitestText([
    'Error: [vitest-pool-runner]: Timeout waiting for worker to respond (ama başlatma cümlesi yok)',
  ]);
  for (const text of [noPath, noCause, noStart])
    assert.equal(planRetry({ code: 1, report: passedReport, text }), null);
});

test('Vitest sayısıyla tutmayan blok sayısı güvenilmez: yeniden deneme yok', () => {
  const one = [workerTimeout(`${ROOT}/src/a.test.ts`)];
  assert.equal(
    planRetry({ code: 1, report: passedReport, text: vitestText(one, { claimed: 2 }) }),
    null,
  );
  assert.equal(
    planRetry({ code: 1, report: passedReport, text: vitestText(one, { reported: 3 }) }),
    null,
  );
});

test('gerçek düşen dosya varsa, çıkış 0 ise, rapor yoksa ya da bölüm yoksa yeniden deneme yok', () => {
  const text = vitestText([workerTimeout(`${ROOT}/src/a.test.ts`)]);
  const realFail = {
    testResults: [
      {
        name: '/r.test.ts',
        status: 'failed',
        assertionResults: [{ status: 'failed', failureMessages: ['AssertionError: x'] }],
      },
    ],
  };
  assert.equal(planRetry({ code: 1, report: realFail, text }), null);
  assert.equal(planRetry({ code: 0, report: passedReport, text }), null);
  assert.equal(planRetry({ code: 1, report: null, text }), null);
  assert.equal(
    planRetry({ code: 1, report: passedReport, text: ' Test Files  1 passed (1)\n' }),
    null,
  );
});

test('düşen altyapı dosyası ve yakalanmamış işçi hatası birlikte gelince ikisi de (tekil) yeniden koşulur', () => {
  const report = {
    testResults: [
      {
        name: `${ROOT}/src/failed.test.ts`,
        status: 'failed',
        message: '[vitest-pool-runner]: Timeout waiting for worker to respond',
      },
    ],
  };
  const text = vitestText([
    workerTimeout(`${ROOT}/src/a.test.ts`),
    workerTimeout(`${ROOT}/src/a.test.ts`),
  ]);
  assert.deepEqual(planRetry({ code: 1, report, text }), [
    `${ROOT}/src/failed.test.ts`,
    'src/a.test.ts',
  ]);
});

test('dosya yolu BOŞLUK içerebilir ve birden çok dosya ", " ile gelebilir: yol doğru çıkarılır', () => {
  const spaced = '/Users/öğrenci/Okul/Bitirme Projem/mezunportal/src/a b.test.ts';
  const text = vitestText([
    workerTimeout(`${spaced}, /Users/öğrenci/Okul/Bitirme Projem/mezunportal/src/c.test.tsx`),
  ]);
  assert.deepEqual(
    unhandledInfraFiles(text).files.map((file) => file.split('/src/')[1]),
    ['a b.test.ts', 'c.test.tsx'],
  );
  const notTests = vitestText([workerTimeout('/Users/x/Bitirme Projem/src/a.ts')]);
  assert.equal(unhandledInfraFiles(notTests), null);
});
