import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const args = process.argv.slice(2);
let route;
let base = process.env.APP_URL;
let output;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--as') {
    console.error('Test girişi henüz yok (Faz 1).');
    process.exit(1);
  } else if (arg === '--url' || arg === '--out') {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${arg} için değer gerekli`);
    if (arg === '--url') base = value;
    else output = value;
  } else if (arg?.startsWith('-') || route) {
    throw new Error(`Geçersiz argüman: ${arg}`);
  } else route = arg;
}
if (!route?.startsWith('/') || route.startsWith('//'))
  throw new Error('Bir uygulama yolu gerekli: /...');
if (!base) throw new Error('APP_URL veya --url gerekli');
const baseUrl = new URL(base);
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('HTTP(S) adresi gerekli');
const target = new URL(route, baseUrl);
if (target.origin !== baseUrl.origin) throw new Error('Yol uygulama adresinde kalmalı');
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  encoding: 'utf8',
}).trim();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
const root = path.resolve(
  output ?? path.join(path.dirname(path.dirname(common)), 'pm-handoff', 'kanit', day),
);
await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, 'tur-'));
const browser = await chromium.launch();
const report = [];
try {
  for (const [name, width, height] of [
    ['390', 390, 844],
    ['1440', 1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const messages = [];
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()))
        messages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => messages.push({ type: 'error', text: error.message }));
    const response = await page.goto(target.href, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`Sayfa açılmadı: ${response?.status() ?? 'yanıt yok'}`);
    const file = path.join(directory, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({
      viewport: name,
      file,
      errors: messages.filter((m) => m.type === 'error').length,
      warnings: messages.filter((m) => m.type === 'warning').length,
      messages,
    });
    await page.close();
  }
  const reportFile = path.join(directory, 'console.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`${JSON.stringify({ report: reportFile, captures: report }, null, 2)}\n`);
} finally {
  await browser.close();
}
