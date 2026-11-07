// P0-04: ayrı süreç sağlık döngüsü. Kuyruk/ürün işi modeller geldikçe eklenir.
// Sunucuya ait kod; Next.js dışındaki Node sürecinde çalışır.
const heartbeat = () => process.stdout.write('worker: ok\n');
heartbeat();
const timer = setInterval(heartbeat, 30_000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => clearInterval(timer));
}
