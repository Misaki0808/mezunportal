import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

// --- İnceleme (R1, kart 214): gerçek hatayı gizleyebilecek ek yollar ---

test('Vitest özeti "Errors N error" diyor ama "Unhandled Errors" bölümü ayrıştırılamıyorsa yeniden deneme YOK', () => {
  const report = {
    testResults: [
      {
        name: `${ROOT}/src/x.test.ts`,
        status: 'failed',
        message: '[vitest-pool-runner]: Timeout waiting for worker to respond',
      },
    ],
  };
  // Başlık satırı bozuk/yok: bölüm bulunamaz ama özet bir hata sayar.
  const drifted = vitestText(['Error: gerçek yakalanmamış hata']).replace(
    /^⎯+ Unhandled Errors ⎯+$/m,
    '',
  );
  assert.equal(planRetry({ code: 1, report, text: drifted }), null);
  const onlySummary = ' Test Files  1 failed | 4 passed (5)\n     Errors  1 error\n';
  assert.equal(planRetry({ code: 1, report, text: onlySummary }), null);
  // Hata özeti hiç yoksa (yalnız düşen altyapı dosyası) yeniden deneme sürer.
  assert.deepEqual(planRetry({ code: 1, report, text: ' Test Files  1 failed | 4 passed (5)\n' }), [
    `${ROOT}/src/x.test.ts`,
  ]);
});

test('işçi hatası bloğunda başka bir hata cümlesi (ör. AssertionError) varsa blok altyapı sayılmaz', () => {
  const mixed = vitestText([
    `${workerTimeout(`${ROOT}/src/a.test.ts`)}\nAssertionError: expected 1 to be 2`,
  ]);
  assert.equal(unhandledInfraFiles(mixed), null);
  assert.equal(planRetry({ code: 1, report: passedReport, text: mixed }), null);
  // Meşru blok ("Error: [vitest-pool]…" + "Caused by: Error: [vitest-pool-runner]…") etkilenmez.
  assert.deepEqual(
    unhandledInfraFiles(vitestText([workerTimeout(`${ROOT}/src/a.test.ts`)])).files,
    ['src/a.test.ts'],
  );
});

// --- main() uçtan uca: sahte `pnpm` ile gerçek giriş noktası (çıkış kodları ve yeniden koşunun kapsamı) ---
const REPO = resolve(import.meta.dirname, '..');
const GATE = join(REPO, 'scripts', 'test-gate.mjs');
const passed = { testResults: [{ name: join(REPO, 'src/ok.test.ts'), status: 'passed' }] };
const infra = {
  testResults: [
    file(
      join(REPO, 'src/slow.test.ts'),
      'failed',
      '[vitest-pool-runner]: Timeout waiting for worker to respond',
    ),
  ],
};
const real = {
  testResults: [
    file(join(REPO, 'src/bad.test.ts'), 'failed', '', [['AssertionError: expected 1 to be 2']]),
  ],
};

/** Sahte pnpm: her çağrıda sıradaki cevabı (çıkış kodu + JSON raporu) verir ve argümanlarını kaydeder. */
function runGate(responses) {
  const dir = mkdtempSync(join(tmpdir(), 'test-gate-e2e-'));
  try {
    writeFileSync(join(dir, 'responses.json'), JSON.stringify(responses));
    const fake = join(dir, 'pnpm');
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const fs = require('node:fs');
const dir = ${JSON.stringify(dir)};
const calls = fs.existsSync(dir + '/calls.json') ? JSON.parse(fs.readFileSync(dir + '/calls.json', 'utf8')) : [];
const responses = JSON.parse(fs.readFileSync(dir + '/responses.json', 'utf8'));
const response = responses[calls.length] ?? { code: 99, report: null };
calls.push(process.argv.slice(2));
fs.writeFileSync(dir + '/calls.json', JSON.stringify(calls));
const out = process.argv.find((arg) => arg.startsWith('--outputFile.json='));
if (out && response.report) fs.writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify(response.report));
process.exit(response.code);
`,
    );
    chmodSync(fake, 0o755);
    const result = spawnSync(process.execPath, [GATE], {
      cwd: REPO,
      env: { ...process.env, TEST_GATE_NESTED: '1', PATH: `${dir}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    const calls = JSON.parse(readFileSync(join(dir, 'calls.json'), 'utf8'));
    return { status: result.status, calls, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('main(): ilk koşu yeşilse çıkış 0 ve yeniden koşu yok', () => {
  const run = runGate([{ code: 0, report: passed }]);
  assert.equal(run.status, 0);
  assert.equal(run.calls.length, 1);
});

test('main(): altyapı kaynaklı düşme YALNIZ o dosyayla bir kez yeniden koşulur; yeniden koşu yeşilse çıkış 0', () => {
  const run = runGate([
    { code: 1, report: infra },
    { code: 0, report: passed },
  ]);
  assert.equal(run.status, 0);
  assert.equal(run.calls.length, 2);
  assert.deepEqual(run.calls[1].slice(-1), [join(REPO, 'src/slow.test.ts')]);
  assert.ok(!run.calls[1].includes(join(REPO, 'src/ok.test.ts')));
  assert.match(run.stderr, /ALTYAPI kaynaklı düştü/);
});

test('main(): yeniden koşu da kırmızıysa kapı kırmızı kalır (yeniden koşunun çıkış kodu YOK SAYILMAZ)', () => {
  const run = runGate([
    { code: 1, report: infra },
    { code: 1, report: infra },
  ]);
  assert.equal(run.status, 1);
  assert.equal(run.calls.length, 2);
});

test('main(): gerçek hata (assert) yeniden denenmez, ilk çıkış kodu aynen döner', () => {
  const run = runGate([{ code: 3, report: real }]);
  assert.equal(run.status, 3);
  assert.equal(run.calls.length, 1);
});

for (const reason of ['Worker exited unexpectedly', 'ERR_WORKER_OUT_OF_MEMORY']) {
  test(`main(): ${reason} görünür biçimde yalnız bir kez denenir; ikinci hata kırmızı`, () => {
    const failed = { testResults: [file(join(REPO, 'src/slow.test.ts'), 'failed', reason)] };
    const run = runGate([
      { code: 1, report: failed },
      { code: 1, report: failed },
    ]);
    assert.equal(run.status, 1);
    assert.equal(run.calls.length, 2);
    assert.match(run.stderr, /bir kez yeniden koşuluyor/);
    assert.match(run.stderr, /bellek/);
    const recovered = runGate([
      { code: 1, report: failed },
      { code: 0, report: passed },
    ]);
    assert.equal(recovered.status, 0);
    assert.equal(recovered.calls.length, 2);
    assert.match(recovered.stderr, /bir kez yeniden koşuluyor/);
  });
}
