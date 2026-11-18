/** Yalnız çağıranın sabit/güvenli olayını yazar; hata nesnesi veya iş yükü kabul etmez. */
export function writeWorkerLog(stream: 'stdout' | 'stderr', line: string): void {
  const timestamp = new Date().toISOString();
  const trimmed = line.trimEnd();
  // Yapılandırılmış günlük JSON kalır; mevcut tüketiciler olay alanını okumayı sürdürür.
  if (trimmed.startsWith('{')) {
    try {
      const event: unknown = JSON.parse(trimmed);
      if (event && typeof event === 'object' && !Array.isArray(event)) {
        process[stream].write(`${JSON.stringify({ ...event, timestamp })}\n`);
        return;
      }
    } catch {
      // Yalnız sabit/güvenli çağıranlar kullanır; biçimi düz metinse önek ekle.
    }
  }
  process[stream].write(`${timestamp} ${trimmed}\n`);
}
