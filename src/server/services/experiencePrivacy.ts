import 'server-only';
import type { PublishedContentHandler } from './accountDeletion';

/** Yayınlanmamış içerik her durumda silinir; K-09 anonim seçeneğinde yalnız yayın korunur. */
export const eraseExperienceContent: PublishedContentHandler = async (tx, userId, choice) => {
  if (choice === 'DELETE') {
    await tx.experience.deleteMany({ where: { authorId: userId } });
  } else {
    await tx.experience.deleteMany({ where: { authorId: userId, status: { not: 'PUBLISHED' } } });
    await tx.experience.updateMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      data: { authorId: null, isAnonymous: true, appliedMonth: null },
    });
  }
  // Şikâyet yayınlanmış içerik değildir; serbest metni de kişisel veri taşıyabilir.
  await tx.report.deleteMany({ where: { reporterId: userId } });
};
