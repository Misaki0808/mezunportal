/**
 * Prisma istemcisi seçenekleri (uygulama ve testler AYNI değeri kullanır).
 *
 * `Experience`, `FaqItem` ve `JobPosting` için `searchVector`/`searchKeys` (ve `User.nameSearch`) veritabanında GENERATED ALWAYS arama sütunlarıdır; şemada `migrate dev`
 * sürüklenmesin diye modellidir (docs/decisions.md). `searchVector` `Unsupported` olduğundan istemcide zaten yoktur.
 * `searchKeys` ise sıradan `String?` görünür: global `omit` varsayılan Prisma yanıtından çıkarır.
 * Yazma denemesini veritabanının GENERATED ALWAYS kısıtı reddeder.
 * Arama ham SQL ile okur (`repositories/search.ts`); açık `select` ile istenirse yine okunur.
 */
export const PRISMA_OMIT = {
  company: { searchKeys: true },
  profile: { targetTitleId: true },
  experience: { searchKeys: true, appliedMonth: true },
  faqItem: { searchKeys: true },
  jobPosting: { searchKeys: true },
  award: { verificationCode: true },
  user: { nameSearch: true },
} as const;
