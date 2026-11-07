/** Koşullu sınıf birleştirici (ek bağımlılık yok). Boş/yanlış değerler atılır. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
