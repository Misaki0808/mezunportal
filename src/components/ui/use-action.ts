'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { ActionFailure, ActionResult } from '@/contracts/result';

import { captureFocus, rescueFocus } from './focus-rescue';
import { useToast } from './toast';

export type RunOptions<T> = {
  /** Başarıda toast olarak gösterilen kısa, bağlama uygun metin ("Profilin güncellendi."). Boş/`undefined` ise toast yok. */
  success?: string | ((data: T) => string | undefined);
  /** Başarıda (toast'tan önce) çalışır: yenile, yönlendir, durumu güncelle. */
  onOk?: (data: T) => void | Promise<void>;
  /** Başarısızlıkta çalışır (alan hatalarını ekrana işlemek için). Girilen veri DOKUNULMAZ: temizlemek ekranın işidir. */
  onFailure?: (failure: ActionFailure) => void;
  /**
   * Eylemden sonra odak kaybolursa (düğme kalktı, pasifleşti, sayfa değişti) nereye gideceği; verilmezse sayfanın
   * `[data-focus-result]` öğesi, yoksa `main h1` (`focus-rescue.ts`). `false`: kurtarma kapalı.
   */
  focusTarget?: (() => HTMLElement | null) | false;
};

/**
 * Kullanıcı eyleminin ortak geri bildirim kalıbı (kart 207): bekleyen durum + çift gönderim kilidi + başarıda toast + hatada
 * kararlı `errorCode` metni. Ağ/çalışma hatası formu düşürmez (`SERVER_UNEXPECTED`). Başarısızlıkta HİÇBİR alan sıfırlanmaz:
 * ekran yerel durumunu yalnız başarıda değiştirir, kullanıcı aynı değerlerle yeniden dener.
 *
 * Kullanım: `const action = useAction(); <Button loading={action.busy} onClick={() => void action.run(...)}>`;
 * hata `action.error` ile `role="alert"` bir paragrafta gösterilir.
 */
export function useAction() {
  const toast = useToast();
  const codes = useTranslations('errors.codes');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const lock = useRef(false);

  async function run<T>(
    action: () => Promise<ActionResult<T>>,
    options: RunOptions<T> = {},
  ): Promise<boolean> {
    if (lock.current) return false;
    const trigger = options.focusTarget === false ? null : captureFocus();
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      let result: ActionResult<T>;
      try {
        result = await action();
      } catch {
        const unexpected: ActionFailure = { ok: false, errorCode: 'SERVER_UNEXPECTED' };
        setFailure(unexpected);
        options.onFailure?.(unexpected);
        return false;
      }
      if (!result.ok) {
        setFailure(result);
        options.onFailure?.(result);
        return false;
      }
      // Eylem zaten başarılı: istemcideki takip işlemi hatası sunucu sonucunu tersine çevirmez.
      try {
        await options.onOk?.(result.data);
      } catch {
        // Hata ayrıntısı kullanıcı verisi içerebilir; günlüğe yazılmaz.
      }
      try {
        const message =
          typeof options.success === 'function' ? options.success(result.data) : options.success;
        if (message) toast.show({ message, tone: 'success' });
      } catch {
        // Bildirim sorunu da başarılı eylemi başarısız göstermemeli.
      }
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
      // Odak eylem sırasında/sonunda kaybolduysa (BODY) klavye kullanıcısı sayfa başına düşmesin.
      rescueFocus(trigger, options.focusTarget ? { target: options.focusTarget } : {});
    }
  }

  return {
    busy,
    failure,
    run,
    clear: () => setFailure(null),
    error: failure
      ? codes(
          failure.errorCode,
          failure.params
            ? Object.fromEntries(
                Object.entries(failure.params).map(([key, value]) => [
                  key,
                  typeof value === 'boolean' ? String(value) : value,
                ]),
              )
            : undefined,
        )
      : undefined,
    fieldError: (field: string) => {
      const code = failure?.fieldErrors?.[field];
      return code ? codes(code) : undefined;
    },
  };
}
