// `pnpm messages:check` — messages/tr.json yapısını ve hata kodu kataloğunu doğrular.
// Node 24 TypeScript'i doğrudan çalıştırır; hata kodu kaydı src/lib/errors.ts'tedir.
import { readFileSync } from 'node:fs';

import { ERROR_CODES } from '../src/lib/errors.ts';

const MESSAGES_PATH = new URL('../messages/tr.json', import.meta.url);
const problems = [];

let messages;
try {
  messages = JSON.parse(readFileSync(MESSAGES_PATH, 'utf8'));
} catch (error) {
  console.error(`messages/tr.json okunamadı ya da geçerli JSON değil: ${error.message}`);
  process.exit(1);
}

// 1) Yapı: yaprak değerler boş olmayan metin; anahtarlarda nokta yok (next-intl iç içe yol sayar).
function walk(node, path) {
  if (typeof node === 'string') {
    if (node.trim() === '') problems.push(`${path}: boş metin`);
    return;
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    problems.push(`${path || '(kök)'}: yalnız iç içe nesne ve metin olabilir`);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.includes('.')) problems.push(`${path ? `${path}.` : ''}${key}: anahtarda nokta olamaz`);
    walk(value, path ? `${path}.${key}` : key);
  }
}
walk(messages, '');

// 2) Hata kodu kataloğu: kayıt <-> metin eşleşmesi (iki yönlü).
const catalog = messages?.errors?.codes;
if (catalog === null || typeof catalog !== 'object') {
  problems.push('errors.codes bulunamadı');
} else {
  for (const code of ERROR_CODES) {
    if (typeof catalog[code] !== 'string') problems.push(`errors.codes.${code}: metin yok`);
  }
  for (const key of Object.keys(catalog)) {
    if (!ERROR_CODES.includes(key)) {
      problems.push(`errors.codes.${key}: src/lib/errors.ts ERROR_CODES içinde kayıtlı değil`);
    }
  }
}

if (problems.length > 0) {
  console.error('messages:check başarısız:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
process.stdout.write(`messages:check tamam (${ERROR_CODES.length} hata kodu).\n`);
