'use client';
import { useEffect, useRef } from 'react';

/**
 * Kuyrukta yüklü bütün öğeler işlenmiş ama imleç sürüyorsa sıradaki sayfayı kendiliğinden yükler: "kuyruk boş" yalnız gerçekten
 * boşken görünür. Aynı imleç için yalnız bir kez denenir (yükleme hata verirse sonsuz yeniden deneme olmaz; kullanıcı
 * "Daha fazla" düğmesiyle yine deneyebilir).
 *
 * `load` isteğin GERÇEKTEN başlayıp başlamadığını döndürebilir: `false` (ör. başka kuyruğun ortak kilidi alınmış) imleci
 * denenmiş saymaz; meşguliyet bitince etki yeniden değerlendirilir ve sıraya girer. Hiçbir şey döndürmeyen `load` başladı sayılır.
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
  load: () => boolean | void;
}) {
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!empty || !cursor || busy || tried.current === cursor) return;
    if (load() === false) return;
    tried.current = cursor;
  }, [empty, cursor, busy, load]);
}
