'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { copyToClipboard } from '@/lib/copy-to-clipboard';

import { Button } from './button';
import type { ButtonVariant } from './button-classes';
import { Field } from './field';
import { Input } from './input';
import { Textarea } from './textarea';
import { useToast } from './toast';

export type CopyButtonProps = {
  /** Panoya yazılacak metin (bağlantı ya da paylaşım metni). */
  text: string;
  /** Başarıda toast metni (kısa, örn. “Bağlantı kopyalandı.”). */
  copiedMessage: string;
  /** Başarısızlıkta tek metin: ne kopyalanamadı ve ne yapılmalı (alan aşağıda görünür). */
  failedMessage: string;
  /** Başarısızlıkta gösterilen salt okunur alanın etiketi. */
  fieldLabel: string;
  /** Uzun metin (cümle) için çok satırlı alan; bağlantı için tek satır. */
  multiline?: boolean;
  variant?: ButtonVariant;
  children: ReactNode;
};

/**
 * Panoya kopyalama düğmesi, sitedeki tek kalıp. Başarıda toast; panoya yazılamazsa (http ağ adresi, izin reddi) metin
 * seçili ve salt okunur bir alanda belirir, doğru bir cümle okunur ve odak alana gider: kullanıcı elle kopyalayabilir.
 * Üst kapsayıcı `flex flex-wrap` ise başarısızlık bloğu kendi satırına geçer.
 */
export function CopyButton({
  text,
  copiedMessage,
  failedMessage,
  fieldLabel,
  multiline = false,
  variant = 'secondary',
  children,
}: CopyButtonProps) {
  const toast = useToast();
  const [failed, setFailed] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!failed || !field) return;
    // `focus()` tarayıcıya bağlı kaydırır (WebKit hiç kaydırmaz, Chromium alanı kenarda bırakır): alan sabit alt gezinmenin
    // arkasında yarım kalırdı. Kaydırmayı biz yaparız; `scroll-above-bars` payı iki motorda da bu çağrıda uygulanır.
    field.focus({ preventScroll: true });
    field.select();
    field.scrollIntoView?.({ block: 'nearest' });
  }, [failed]);

  async function copy() {
    if (await copyToClipboard(text)) {
      setFailed(false);
      toast.show({ message: copiedMessage, tone: 'success' });
    } else {
      setFailed(true);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => void copy()}>
        {children}
      </Button>
      {failed && (
        <div className="w-full basis-full space-y-2">
          <p role="alert">{failedMessage}</p>
          <Field label={fieldLabel}>
            {(control) =>
              multiline ? (
                <Textarea
                  {...control}
                  ref={fieldRef}
                  readOnly
                  rows={3}
                  className="scroll-above-bars"
                  value={text}
                  onFocus={(event) => event.currentTarget.select()}
                />
              ) : (
                <Input
                  {...control}
                  ref={fieldRef}
                  readOnly
                  className="scroll-above-bars"
                  value={text}
                  onFocus={(event) => event.currentTarget.select()}
                />
              )
            }
          </Field>
        </div>
      )}
    </>
  );
}
