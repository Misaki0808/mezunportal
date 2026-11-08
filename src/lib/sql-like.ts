/**
 * `LIKE`/`ILIKE` desenine girecek kullanıcı metninde özel karakterleri (`%`, `_`, `\`) düz metin yapar. Prisma
 * `contains` bunları kendisi kaçırmaz: `%%` araması bütün satırları döndürürdü.
 */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);
