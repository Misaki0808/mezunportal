import { chromium } from '@playwright/test';
import { BASE } from './lib.mjs';
const [state, optional] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: `.tur/${state}.state.json` });
const p = await ctx.newPage(); await p.goto(BASE + '/onay'); await p.waitForLoadState('networkidle');
const cbs = p.locator('input[type=checkbox]'); const n = await cbs.count();
for (let i = 0; i < n - (optional ? 0 : 1); i++) if (!(await cbs.nth(i).isChecked())) await cbs.nth(i).check();
await p.getByRole('button', { name: /kaydet/ }).click(); await p.waitForURL((u) => !u.pathname.startsWith('/onay'), { timeout: 10000 }).catch(() => {});
console.log(state, '→', p.url()); await ctx.storageState({ path: `.tur/${state}.state.json` }); await b.close();
