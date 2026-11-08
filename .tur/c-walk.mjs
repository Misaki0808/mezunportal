// Kullanım: node c-walk.mjs <durum|persona:rol> <etiket> <yol>...
import { open, track, shot, save, persona, BASE, WIDTHS } from './lib.mjs';
const [state, tag, ...paths] = process.argv.slice(2);
const b = await open(); const log = []; const res = [];
const ctx = state.startsWith('persona:') ? await persona(b, state.slice(8)) : await b.newContext({ storageState: `.tur/${state}.state.json` });
const p = await ctx.newPage(); track(p, log);
for (const path of paths) {
  await p.goto(BASE + path); await p.waitForLoadState('networkidle');
  for (const [w, h] of WIDTHS) await shot(p, `${tag}${path.replaceAll('/', '_')}`, w, h, res);
}
await save(`c-${tag}`, { res, log }); await b.close();
for (const r of res) console.log(`${r.label} ${r.w} → ${r.url} sw=${r.scroll.sw}/${r.scroll.cw} h=${r.scroll.sh} h1=${r.h1} small=${JSON.stringify(r.small)} ov=${r.overflow.length} alerts=${JSON.stringify(r.alerts)}` + (r.w === 390 ? '\n  ' + r.controls.map((c) => `${c.t} "${c.n}" ${c.x},${c.y} ${c.w}x${c.h}`).join('\n  ') : ''));
console.log('LOG', log);
