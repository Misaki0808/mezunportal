// Birleştirme kapısı için tam test: `pnpm test` ile aynı kapsam, ama YALNIZ ALTYAPI kaynaklı düşen dosyaları bir kez yeniden koşar.
// Neden: yük altında Vitest işçisi 60 sn içinde yanıt vermeyince "[vitest-pool-runner]: Timeout waiting for worker to respond" ile
// kodla ilgisiz testler düşüyor; bu süre Vitest içinde sabittir (ayar yok). Başka her kırmızı (assert, derleme, bilinmeyen/yakalanmamış
// hata) DERHAL kırmızıdır: yeniden deneme asla gerçek bir hatayı gizlemez.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INFRA =
  /\[vitest-pool(?:-runner)?\]|Timeout (?:waiting for worker|starting .* runner|terminating)|Worker exited unexpectedly|ERR_WORKER_OUT_OF_MEMORY/i;

/** Rapordaki düşen dosyaları ayırır: yalnız altyapı mesajı taşıyanlar `infraFiles`, geri kalan her şey `real`. */
export function classify(report) {
  const infraFiles = [];
  let real = 0;
  for (const file of report?.testResults ?? []) {
    if (file.status !== 'failed') continue;
    const messages = [
      ...(file.message ? [file.message] : []),
      ...(file.assertionResults ?? [])
        .filter((assertion) => assertion.status === 'failed')
        .flatMap((assertion) => assertion.failureMessages ?? []),
    ];
    if (messages.length > 0 && messages.every((message) => INFRA.test(String(message))))
      infraFiles.push(file.name);
    else real += 1;
  }
  return { infraFiles, real };
}

function runVitest(extraArgs, outFile) {
  rmSync(outFile, { force: true });
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--maxWorkers=2',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${outFile}`,
      ...extraArgs,
    ],
    { stdio: 'inherit' },
  );
  const report = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  return { code: result.status ?? 1, report };
}

export function main() {
  const scriptTests = readdirSync('scripts')
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => join('scripts', name));
  const nodeTests = spawnSync(process.execPath, ['--test', ...scriptTests], { stdio: 'inherit' });
  if (nodeTests.status !== 0) return nodeTests.status ?? 1;
  const out = join(tmpdir(), `vitest-gate-${process.pid}.json`);
  try {
    const first = runVitest([], out);
    if (first.code === 0) return 0;
    const { infraFiles, real } = classify(first.report);
    // Rapor yoksa ya da gerçek bir kırmızı varsa yeniden deneme YOK.
    if (!first.report || real > 0 || infraFiles.length === 0) return first.code;
    process.stderr.write(
      `\ntest-gate: ${infraFiles.length} dosya ALTYAPI kaynaklı düştü (işçi zaman aşımı), yalnız bunlar bir kez yeniden koşuluyor:\n${infraFiles.map((f) => `  ${f}`).join('\n')}\n\n`,
    );
    return runVitest(infraFiles, out).code;
  } finally {
    rmSync(out, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
