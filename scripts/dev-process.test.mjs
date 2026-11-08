import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

async function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
async function waitFor(check, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error('Süre doldu: süreçler beklenen duruma gelmedi');
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGKILL', 'EXIT']) {
  test(`dev üst süreci ${signal} ile kapanınca grup üç saniyede temizlenir`, async () => {
    const worker = `process.on('SIGTERM',()=>{}); console.log('CHILD:'+process.pid); setInterval(()=>{},1000)`;
    const parent = `import { startDevProcesses } from './scripts/dev-process.mjs'; const p=startDevProcesses([['-e',${JSON.stringify(worker)}],['-e',${JSON.stringify(worker)}]],process.env); console.log('SUP:'+p.pid); ${signal === 'EXIT' ? "process.stdin.on('data',()=>process.exit(0)); process.stdin.resume();" : ''}`;
    const proc = spawn(process.execPath, ['--input-type=module', '-e', parent], {
      cwd: process.cwd(),
      stdio: [signal === 'EXIT' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const finished = once(proc, 'exit');
    let ids = [];
    try {
      await waitFor(
        () => (output.match(/CHILD:\d+/g) ?? []).length === 2 && /SUP:\d+/.test(output),
      );
      ids = [...output.matchAll(/(?:CHILD|SUP):(\d+)/g)].map((match) => Number(match[1]));
      assert.equal(ids.length, 3);
      if (signal === 'EXIT') proc.stdin.write('exit');
      else proc.kill(signal);
      await finished;
      await waitFor(async () => (await Promise.all(ids.map(alive))).every((value) => !value));
    } finally {
      if (await alive(proc.pid)) proc.kill('SIGKILL');
      for (const pid of ids)
        if (await alive(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
    }
  });
}
