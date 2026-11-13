/**
 * Metni panoya yazar; yazamazsa `false` döner, asla fırlatmaz.
 *
 * `navigator.clipboard` yalnız güvenli bağlamda (https, localhost) vardır: telefonu `http://` ağ adresiyle açınca
 * tanımsızdır; bazı tarayıcı ayarları ve izin reddi de `writeText`'i düşürür. O durumda seçim + `execCommand('copy')`
 * eski yolu denenir. İkisi de olmazsa çağıran, metni seçilebilir bir alanda göstermelidir (`CopyButton` bunu yapar).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // İzin yok ya da güvenli olmayan bağlam: eski yönteme düşülür.
  }
  return copyWithSelection(text);
}

function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  // iOS odaklanınca yakınlaştırmasın (16 px) ve sayfa kaymasın (ekran dışı, sabit konum).
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px';
  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus();
  }
}
