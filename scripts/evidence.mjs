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
let persona;
let viewport;
let theme;
const personas = {
  student: 'student',
  öğrenci: 'student',
  seniorMentor: 'seniorMentor',
  'üst sınıf mentor': 'seniorMentor',
  alumniMentor: 'alumniMentor',
  'mezun mentor': 'alumniMentor',
  academic: 'academic',
  akademisyen: 'academic',
  departmentAdmin: 'departmentAdmin',
  'bölüm yöneticisi': 'departmentAdmin',
  systemAdmin: 'systemAdmin',
  'sistem yöneticisi': 'systemAdmin',
};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--as') {
    const value = args[++i];
    if (!value || !Object.hasOwn(personas, value)) throw new Error('Geçerli bir test rolü gerekli');
    persona = personas[value];
  } else if (arg === '--url' || arg === '--out' || arg === '--width' || arg === '--theme') {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${arg} için değer gerekli`);
    if (arg === '--url') base = value;
    else if (arg === '--out') output = value;
    else if (arg === '--theme') {
      if (!['light', 'dark'].includes(value)) throw new Error('Tema light veya dark olmalı');
      theme = value;
    } else {
      if (!['360', '390', '1440'].includes(value))
        throw new Error('Genişlik 360, 390 veya 1440 olmalı');
      viewport = value;
    }
  } else if (arg?.startsWith('-') || route) {
    throw new Error(`Geçersiz argüman: ${arg}`);
  } else route = arg;
}
if (!route?.startsWith('/') || route.startsWith('//'))
  throw new Error('Bir uygulama yolu gerekli: /...');
if (!base) throw new Error('APP_URL veya --url gerekli');
const baseUrl = new URL(base);
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('HTTP(S) adresi gerekli');
if (
  persona &&
  (!['local', 'test'].includes(process.env.APP_ENV) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname))
)
  throw new Error('Test girişi yalnız yerel/test ortamındaki yerel sunucuda kullanılabilir');
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
  const context = await browser.newContext(theme ? { colorScheme: theme } : {});
  if (persona) {
    const login = await context.newPage();
    const loginUrl = new URL('/giris/test', baseUrl);
    loginUrl.searchParams.set('persona', persona);
    const response = await login.goto(loginUrl.href);
    if (!response?.ok()) throw new Error('Test giriş sayfası açılamadı');
    await login.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await login.waitForURL(
      (url) => url.origin === baseUrl.origin && ['/hesap', '/onay'].includes(url.pathname),
    );
    await login.close();
  }
  for (const [name, width, height] of [
    ['360', 360, 780],
    ['390', 390, 844],
    ['1440', 1440, 900],
  ].filter(([name]) => (viewport ? name === viewport : name !== '360'))) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
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
