/**
 * Prisma istemcisi seçenekleri (uygulama ve testler AYNI değeri kullanır).
 *
 * `Experience.searchVector`/`searchKeys` veritabanında GENERATED ALWAYS arama sütunlarıdır; şemada `migrate dev`
 * sürüklenmesin diye modellidir (docs/decisions.md). `searchVector` `Unsupported` olduğundan istemcide zaten yoktur.
 * `searchKeys` ise sıradan `String?` görünür: global `omit` ile hiçbir sorguda VARSAYILAN dönmez (yanıta sızmaz,
 * yanlışlıkla yazılmaz). Arama ham SQL ile okur (`repositories/search.ts`); açık `select` ile istenirse yine okunur.
 */
export const PRISMA_OMIT = {
  experience: { searchKeys: true },
} as const;
