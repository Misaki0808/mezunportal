import { spawn } from 'node:child_process';

// Üst süreç SIGKILL ile ölse de grup sahipsiz kalmaz. Gözetici grubun lideridir.
const parentPid = process.ppid;
const commands = JSON.parse(process.argv[2]);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(parentWatch);
  try {
    process.kill(-process.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  // SIGTERM'e uymayan süreçler ve Next'in torunları da süre sonunda kapanır.
  setTimeout(() => {
    try {
      process.kill(-process.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }, 1000);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const parentWatch = setInterval(() => {
  if (process.ppid !== parentPid || process.ppid === 1) stop();
}, 100);
for (const args of commands) {
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  child.once('error', stop);
  child.once('exit', stop);
}
