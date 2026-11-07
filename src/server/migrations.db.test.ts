import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';

const prisma = createTestPrisma();

// Diğer test dosyaları aynı veritabanında kendi kurumlarını ve üyeliklerini bırakır; bu dosya yalnız
// kendi “Test Üni” kayıtlarını temizler.
async function clearInstitutions() {
  await prisma.department.deleteMany({ where: { faculty: { university: { name: 'Test Üni' } } } });
  await prisma.faculty.deleteMany({ where: { university: { name: 'Test Üni' } } });
  await prisma.university.deleteMany({ where: { name: 'Test Üni' } });
}

afterAll(async () => {
  await clearInstitutions();
  await prisma.$disconnect();
});

// Global kurulum test veritabanını sıfırlayıp bütün migration'ları boş veritabanına uyguladı;
// burada sonuç doğrulanır.
describe('ilk migration (boş veritabanında)', () => {
  it('pg_trgm ve btree_gist uzantıları kuruludur', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'btree_gist') ORDER BY extname`;
    expect(rows.map((row) => row.extname)).toEqual(['btree_gist', 'pg_trgm']);
  });

  it('kurum tabloları vardır', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('University', 'Faculty', 'Department')
      ORDER BY table_name`;
    expect(rows.map((row) => row.table_name)).toEqual(['Department', 'Faculty', 'University']);
  });

  it('bütün migration kayıtları başarıyla uygulanmıştır', async () => {
    const rows = await prisma.$queryRaw<{ pending: number }[]>`
      SELECT count(*)::int AS pending FROM _prisma_migrations WHERE finished_at IS NULL`;
    expect(rows[0]?.pending).toBe(0);
  });

  it('aynı üniversite adı ikinci kez eklenemez', async () => {
    await clearInstitutions();
    const data = {
      name: 'Test Üni',
      shortName: 'TÜ',
      studentEmailDomains: [],
      staffEmailDomains: [],
    };
    await prisma.university.create({ data });
    await expect(
      prisma.university.create({ data: { ...data, shortName: 'TÜ2' } }),
    ).rejects.toThrow();
    await clearInstitutions();
  });

  it('fakültesi olan üniversite silinemez (Restrict)', async () => {
    await clearInstitutions();
    const university = await prisma.university.create({
      data: {
        name: 'Test Üni',
        shortName: 'TÜ',
        studentEmailDomains: [],
        staffEmailDomains: [],
        faculties: { create: { name: 'Fakülte' } },
      },
    });
    await expect(prisma.university.delete({ where: { id: university.id } })).rejects.toThrow();
    await clearInstitutions();
  });
});
