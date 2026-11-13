// Birleştirme kapısı için tam test: `pnpm test` ile aynı kapsam, ama YALNIZ ALTYAPI kaynaklı düşen dosyaları bir kez yeniden koşar.
// Neden: yük altında Vitest işçisi 60 sn içinde yanıt vermeyince "[vitest-pool-runner]: Timeout waiting for worker to respond" ile
// kodla ilgisiz testler düşüyor; bu süre Vitest içinde sabittir (ayar yok). İki biçimi vardır: (1) dosya "düştü" (rapordaki `testResults`),
// (2) dosya GEÇTİ ama işçi başlatılamadı: Vitest "Unhandled Error: Failed to start forks worker for test files ..." yazar, çıkış kodu 1
// olur, JSON raporunda ise bu hata YOKTUR (`success: true`): yalnız metin çıktısındadır, bu yüzden çıktı yakalanıp ayrıştırılır.
// Başka her kırmızı (assert, derleme, kalıba uymayan ya da dosyası çıkarılamayan yakalanmamış hata) DERHAL kırmızıdır:
// yeniden deneme asla gerçek bir hatayı gizlemez.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const INFRA =
  /\[vitest-pool(?:-runner)?\]|Timeout (?:waiting for worker|starting .* runner|terminating)|Worker exited unexpectedly|ERR_WORKER_OUT_OF_MEMORY/i;
const ASSERTION_FAILURE = /^\s*(?:Caused by:\s*)?(?:AssertionError\b|Error:\s*expect\()/m;

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
    if (
      messages.length > 0 &&
      messages.every((message) => {
        const text = String(message).replace(ANSI, '');
        return !ASSERTION_FAILURE.test(text) && INFRA.test(text);
      })
    )
      infraFiles.push(file.name);
    else real += 1;
  }
  return { infraFiles, real };
}

// İşçi başlatma/yanıt zaman aşımının KÖK NEDENİ (INFRA'dan dar: "[vitest-pool]" öneki tek başına yetmez).
const CAUSE =
  /Timeout (?:waiting for worker|starting .* runner|terminating)|Worker exited unexpectedly|ERR_WORKER_OUT_OF_MEMORY/i;
const WORKER_START = /\[vitest-pool\]: Failed to start \w+ worker for test files?\s+([^\n]+)/;
const TEST_FILE_END = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const ANSI = /\x1b\[[0-9;]*m/g;
const SUMMARY_ERRORS = /^\s*Errors\s+[1-9]\d*\s+errors?/m;

/**
 * Vitest metin çıktısındaki "Unhandled Errors" bölümünü ayrıştırır. Bölüm yoksa `null`. Blok sayısı Vitest'in bildirdiği sayıyla
 * ("Vitest caught N unhandled error", özetteki "Errors N error") tutmuyorsa `trusted: false`: sayılamayan hata güvenilmez.
 */
export function parseUnhandled(text) {
  const clean = String(text ?? '').replace(ANSI, '');
  const start = clean.search(/^⎯+ Unhandled Errors ⎯+$/m);
  if (start < 0) return null;
  const rest = clean.slice(start);
  const summary = rest.search(/^\s*Test Files\s/m);
  const section = summary < 0 ? rest : rest.slice(0, summary);
  const claimed = /Vitest caught (\d+) unhandled error/.exec(section)?.[1];
  const reported = /^\s*Errors\s+(\d+) errors?/m.exec(summary < 0 ? '' : rest.slice(summary))?.[1];
  const headers = [...section.matchAll(/^⎯{3,} ([^⎯\n]+?) ⎯{3,}$/gm)].filter(
    (match) => match[1] !== 'Unhandled Errors',
  );
  const blocks = headers.map((match, index) => {
    const from = match.index + match[0].length;
    const to = headers[index + 1]?.index ?? section.length;
    // Son bloğu kapatan düz ayırıcı satırı (⎯⎯⎯…) gövdeden at.
    return section
      .slice(from, to)
      .replace(/^⎯{10,}\s*$/m, '')
      .trim();
  });
  const expected = [claimed, reported].filter((value) => value !== undefined).map(Number);
  const trusted = blocks.length > 0 && expected.every((count) => count === blocks.length);
  return { blocks, trusted };
}

/**
 * Yakalanmamış hataların HEPSİ "işçi başlatılamadı + zaman aşımı" kalıbına uyuyorsa ve her birinden test dosyası yolu çıkarılabiliyorsa
 * `{ files }`, aksi halde `null` (tek bir kalıba uymayan hata bile hepsini kırmızı yapar: `some` DEĞİL `every`).
 */
export function unhandledInfraFiles(text) {
  const parsed = parseUnhandled(text);
  if (!parsed || !parsed.trusted) return null;
  const files = [];
  for (const block of parsed.blocks) {
    if (ASSERTION_FAILURE.test(block)) return null;
    const start = WORKER_START.exec(block);
    if (!start || !CAUSE.test(block)) return null;
    // Aynı blokta başka bir hata cümlesi (ör. "AssertionError: …") varsa blok yalnız işçi hatası DEĞİLDİR: kalıp eşleşmesi onu gizlemesin.
    const errorLines = block
      .split('\n')
      .filter((line) => /^\s*(?:Caused by:\s*)?[A-Za-z]*Error\b/.test(line));
    if (!errorLines.every((line) => INFRA.test(line))) return null;
    // Yol BOŞLUK içerebilir ("Okul/Bitirme Projem/..."): satırın tamamı alınır, sondaki nokta atılır, ", " ile bölünür ve her
    // parça test uzantısıyla bitmeli; bitmiyorsa dosya güvenle çıkarılamamıştır → yeniden deneme yok.
    const paths = start[1]
      .trim()
      .replace(/\.$/, '')
      .split(', ')
      .map((path) => path.trim());
    if (paths.length === 0 || !paths.every((path) => TEST_FILE_END.test(path))) return null;
    files.push(...paths);
  }
  return { files: [...new Set(files)].map((file) => relative(process.cwd(), file) || file) };
}

/**
 * İlk koşunun sonucundan yeniden koşulacak dosyaları çıkarır. `null` = yeniden deneme YOK, kapı kırmızı (ya da yeşil) kalır.
 * Yeniden deneme yalnız: çıkış ≠ 0, rapor var, düşen gerçek dosya yok, yakalanmamış hata varsa hepsi altyapı kalıbında, ve
 * yeniden koşulacak en az bir dosya var.
 */
export function planRetry({ code, report, text }) {
  if (code === 0 || !report) return null;
  const { infraFiles, real } = classify(report);
  if (real > 0) return null;
  const parsed = parseUnhandled(text);
  // Vitest özeti "Errors N error" diyor ama "Unhandled Errors" bölümü ayrıştırılamadı (biçim kayması, bozuk çıktı): sayılamayan hata
  // güvenilmez, yeniden deneme ona karşı sessizce yeşil üretmesin.
  if (parsed === null && SUMMARY_ERRORS.test(String(text ?? '').replace(ANSI, ''))) return null;
  const unhandled = parsed === null ? { files: [] } : unhandledInfraFiles(text);
  if (!unhandled) return null;
  const files = [...new Set([...infraFiles, ...unhandled.files])];
  return files.length > 0 ? files : null;
}

const TAIL_LIMIT = 2_000_000;

/** Vitest'i koşar; çıktıyı CANLI akıtır ve ayrıştırma için sonunu (yakalanmamış hata bölümü sondadır) yakalar. */
function runVitest(extraArgs, outFile) {
  rmSync(outFile, { force: true });
  return new Promise((resolve) => {
    let text = '';
    const child = spawn(
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
      { stdio: ['inherit', 'pipe', 'pipe'] },
    );
    // `setEncoding`: çok baytlı karakter ("⎯", Türkçe harfler) yığın sınırında bölünürse her yığını ayrı çevirmek onu bozar ve
    // "Unhandled Errors" başlığı ayrıştırılamaz.
    const tee = (stream, out) => {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        out.write(chunk);
        text = (text + chunk).slice(-TAIL_LIMIT);
      });
    };
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('close', (status) => {
      const report = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
      resolve({ code: status ?? 1, report, text });
    });
  });
}

export async function main() {
  // `TEST_GATE_NESTED=1`: uçtan uca bekçi testi (test-gate.test.mjs) bu dosyayı sahte `pnpm` ile ÇOCUK süreçte koşar; betik
  // testlerini yeniden başlatmak o testin kendisini yeniden koşturup sonsuz özyinelemeye girerdi, bu yüzden bu adım atlanır.
  if (process.env.TEST_GATE_NESTED !== '1') {
    const scriptTests = readdirSync('scripts')
      .filter((name) => name.endsWith('.test.mjs'))
      .map((name) => join('scripts', name));
    const nodeTests = spawnSync(process.execPath, ['--test', ...scriptTests], { stdio: 'inherit' });
    if (nodeTests.status !== 0) return nodeTests.status ?? 1;
  }
  const out = join(tmpdir(), `vitest-gate-${process.pid}.json`);
  try {
    const first = await runVitest([], out);
    if (first.code === 0) return 0;
    const files = planRetry(first);
    // Rapor yoksa, gerçek bir kırmızı ya da kalıba uymayan/dosyası çıkarılamayan yakalanmamış hata varsa yeniden deneme YOK.
    if (!files) return first.code;
    process.stderr.write(
      `\ntest-gate: ${files.length} dosya ALTYAPI kaynaklı düştü (işçi çökmesi, bellek veya zaman aşımı), yalnız bunlar bir kez yeniden koşuluyor:\n${files.map((f) => `  ${f}`).join('\n')}\n\n`,
    );
    return (await runVitest(files, out)).code;
  } finally {
    rmSync(out, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
