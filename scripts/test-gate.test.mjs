import assert from 'node:assert/strict';
import test from 'node:test';

import { classify } from './test-gate.mjs';

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
