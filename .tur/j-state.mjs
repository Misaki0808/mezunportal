import { chromium } from '@playwright/test';
import { BASE } from './lib.mjs';
const b = await chromium.launch();
for (const who of process.argv.slice(2)) {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(`${BASE}/giris/test?persona=${who}`);
  await p.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await p.waitForURL((u) => ['/hesap', '/onay'].includes(u.pathname));
  console.log(who, '→', new URL(p.url()).pathname);
  await ctx.storageState({ path: `.tur/${who}.state.json` }); await ctx.close();
}
await b.close();
