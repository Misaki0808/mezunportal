/**
 * "AI izi" kuralları (kullanıcı kararı, 9 Kas; saf işlevler, dosya okumaz): arayüzde yıldız/ışıltı süsü yoktur ve mercan
 * Claude turuncusuna (≈#D97757) benzemez. Testler işlevi sentetik girdiyle sınar; gerçek dosyaları okuyan test ince bir bağdır.
 */
// Karakterler kaçış koduyla yazılır: bu dosya da kaynak taramasına girer.
const SPARKLE = /[\u2733\u2726\u2727\u2728\u2B50\u2605\u2606\u2747\u2748\u2734\u2735\u26A1]/u;

/** Metinde süs yıldızı/ışıltı karakteri var mı. */
export function hasSparkle(text: string): boolean {
  return SPARKLE.test(text);
}

/** `#rrggbb` değerinin kırmızı, yeşil, mavi bileşenleri; geçersizse `null`. */
export function rgbOf(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = match[1];
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/**
 * Vurgu rengi pembeye yakın mı (turuncu değil)? Turuncuda yeşil bileşen mavi bileşenden belirgin yüksektir; mercan-pembede mavi
 * yeşile eşit ya da yüksektir. Kırmızı bileşen yüksek kalır (sıcak ton).
 */
export function isPinkishAccent(hex: string): boolean {
  const rgb = rgbOf(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return r > 200 && b >= g;
}
