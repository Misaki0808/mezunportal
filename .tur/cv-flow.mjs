import { chromium } from '@playwright/test';
import { BASE, OUT, measure } from './lib.mjs';
const [pdf] = process.argv.slice(2);
const b = await chromium.launch(); const log = [];
const ctx = await b.newContext({ storageState: '.tur/student.state.json', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(m.text().slice(0, 200)); });
let n = 0;
const al = () => p.$$eval('[role=alert],[role=status]', (e) => e.map((x) => x.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean));
async function snap(l) { await p.waitForTimeout(500); const m = await measure(p); await p.screenshot({ path: `${OUT}/cv-${String(++n).padStart(2, '0')}-${l}-390v.png` }); await p.screenshot({ path: `${OUT}/cv-${String(n).padStart(2, '0')}-${l}-390.png`, fullPage: true }); console.log(`${String(n).padStart(2, '0')} ${l} ${m.url} h1=${m.h1} h=${m.scroll.sh} sw=${m.scroll.sw}/${m.scroll.cw} small=${JSON.stringify(m.small.map((s) => s.n + ' ' + s.h))} alerts=${JSON.stringify(await al())}`); }
await p.goto(BASE + '/profil/cv'); await p.waitForLoadState('networkidle');
await p.getByLabel(/CV dosyası/).setInputFiles(pdf); await p.getByRole('button', { name: "CV'yi oku" }).click();
await snap('isleniyor');
await p.getByRole('heading', { name: 'Bulunan bilgileri gözden geçir' }).waitFor({ timeout: 60000 }); await snap('onay');
console.log('kalem sayısı', await p.locator('li:has(button:has-text("Kabul et"))').count());
await p.getByRole('button', { name: /hepsini kabul et/ }).click(); await snap('hepsi-kabul');
await p.getByRole('button', { name: 'Seçilenleri uygula' }).click(); await p.waitForTimeout(2000); await snap('uygulandi');
await p.goto(BASE + '/profil'); await p.waitForLoadState('networkidle'); await snap('profil-dolu');
await p.goto(BASE + '/profil/cv'); await p.waitForLoadState('networkidle'); await snap('cv-sonrasi');
console.log('LOG', log); await b.close();
