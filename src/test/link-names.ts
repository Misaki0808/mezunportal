/**
 * Sayfadaki bağlantıların erişilebilir adı: `aria-label`, yoksa görünür metin. Aynı ad iki FARKLI hedefe gidiyorsa ekran
 * okuyucu kullanıcı ayırt edemez (`tests/e2e/a11y.ts` turunun "aynı adlı farklı hedef" kuralının birim karşılığı).
 * Dönen satırlar boşsa sorun yoktur.
 */
export function ambiguousLinkNames(root: ParentNode = document.body): string[] {
  const targets = new Map<string, Set<string>>();
  for (const link of root.querySelectorAll('a[href]')) {
    const name = (link.getAttribute('aria-label') ?? link.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    targets.set(name, (targets.get(name) ?? new Set()).add(link.getAttribute('href')!));
  }
  return [...targets]
    .filter(([, hrefs]) => hrefs.size > 1)
    .map(([name, hrefs]) => `"${name}" → ${[...hrefs].join(' | ')}`);
}
