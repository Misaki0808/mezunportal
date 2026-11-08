// viewport görüntüsü: node v.mjs <durum> <etiket> <yol> <genişlik> [kaydırY]
import { chromium } from '@playwright/test';
import { OUT, BASE } from './lib.mjs';
const [state, tag, u, w, y] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: `.tur/${state}.state.json`, viewport: { width: +w, height: +w > 1000 ? 900 : 800 } });
const p = await ctx.newPage(); await p.goto(BASE + u); await p.waitForLoadState('networkidle');
if (y) await p.evaluate((v) => window.scrollTo(0, v), +y);
await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}/${tag}.png` }); await b.close();
