'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Form hatasında odağı ilk hatalı alana taşır (klavye ve ekran okuyucu için). `focusFirstInvalid()` hata durumu YAZILDIKTAN
 * sonra çağrılır; odak, `aria-invalid="true"` alana yeniden çizimden sonra verilir. Gönder düğmesinde kalmak yerine kullanıcı
 * doğrudan düzeltilecek alana iner (deneyim formundaki kalıp).
 */
export function useFocusFirstInvalid() {
  const formRef = useRef<HTMLFormElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tick]);
  const focusFirstInvalid = useCallback(() => setTick((value) => value + 1), []);
  return { formRef, focusFirstInvalid };
}
