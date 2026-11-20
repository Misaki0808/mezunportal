'use client';
import { useEffect, useRef } from 'react';

/**
 * Kuyrukta yüklü bütün öğeler işlenmiş ama imleç sürüyorsa sıradaki sayfayı kendiliğinden yükler: "kuyruk boş" yalnız gerçekten
 * boşken görünür. Aynı imleç için yalnız bir kez denenir (yükleme hata verirse sonsuz yeniden deneme olmaz; kullanıcı
 * "Daha fazla" düğmesiyle yine deneyebilir).
 */
export function useRefillWhenEmpty({
  empty,
  cursor,
  busy,
  load,
}: {
  empty: boolean;
  cursor: string | null;
  busy: boolean;
  load: () => void;
}) {
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!empty || !cursor || busy || tried.current === cursor) return;
    tried.current = cursor;
    load();
  }, [empty, cursor, busy, load]);
}
