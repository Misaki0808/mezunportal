import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

// Veritabanı CV tablolarının değişmezlerini TEK BAŞINA zorlar (servis hatası olsa bile bozuk veri yazılamaz).
async function rejects(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeDefined();
}

const key = (userId: string) => `cv/${userId}/${randomUUID()}.pdf`;
const upload = (userId: string, data: Record<string, unknown> = {}) =>
  db.cvUpload.create({
    data: { userId, storageKey: key(userId), byteSize: 10, pageCount: 1, ...data } as never,
  });

describe('CvUpload kısıtları', () => {
  it('ayrıştırma çıktısı yalnız PARSED’dadır; PARSED çıktısız olamaz', async () => {
    const userId = await createUser(db);
    await rejects(upload(userId, { status: 'PARSED' }));
    await rejects(upload(userId, { status: 'QUEUED', parsedJson: { skills: [] } }));
    await rejects(
      upload(userId, { status: 'APPLIED', appliedAt: new Date(), parsedJson: { skills: [] } }),
    );
    await upload(userId, { status: 'PARSED', parsedJson: { skills: [] } });
  });

  it('FAILED hata kodu ister, başka durum hata kodu taşıyamaz', async () => {
    const userId = await createUser(db);
    await rejects(upload(userId, { status: 'FAILED' }));
    await rejects(upload(userId, { status: 'QUEUED', errorCode: 'CV_PARSE_EMPTY' }));
    await upload(userId, { status: 'FAILED', errorCode: 'CV_PARSE_EMPTY', storageKey: null });
    // Dosyası silinememiş FAILED satır anahtarını koruyabilir (temizleme işi siler).
    await upload(userId, { status: 'FAILED', errorCode: 'CV_PARSE_EMPTY' });
  });

  it('APPLIED uygulama anı ister; işlenen/bekleyen CV dosyasız olamaz', async () => {
    const userId = await createUser(db);
    await rejects(upload(userId, { status: 'APPLIED' }));
    await rejects(upload(userId, { status: 'QUEUED', storageKey: null }));
    await upload(userId, { status: 'APPLIED', appliedAt: new Date() });
    await upload(userId, { status: 'DISCARDED', storageKey: null });
  });

  it('boyut ≤ 5 MB, sayfa 1–6, geçerli anahtar biçimi', async () => {
    const userId = await createUser(db);
    await rejects(upload(userId, { status: 'DISCARDED', byteSize: 5 * 1024 * 1024 + 1 }));
    await rejects(upload(userId, { status: 'DISCARDED', byteSize: 0 }));
    await rejects(upload(userId, { status: 'DISCARDED', pageCount: 7 }));
    await rejects(upload(userId, { status: 'DISCARDED', pageCount: 0 }));
    await rejects(upload(userId, { status: 'DISCARDED', storageKey: '../etc/passwd' }));
    await rejects(
      upload(userId, {
        status: 'DISCARDED',
        storageKey: `graduation/${userId}/${randomUUID()}.pdf`,
      }),
    );
    await upload(userId, { status: 'DISCARDED', byteSize: 5 * 1024 * 1024, pageCount: 6 });
  });

  it('kullanıcı başına en fazla bir işlenen (QUEUED/PARSING) ve bir onay bekleyen (PARSED) CV', async () => {
    const userId = await createUser(db);
    await upload(userId, { status: 'QUEUED' });
    await rejects(upload(userId, { status: 'QUEUED' }));
    await rejects(upload(userId, { status: 'PARSING' }));
    await upload(userId, { status: 'PARSED', parsedJson: { skills: [] } });
    await rejects(upload(userId, { status: 'PARSED', parsedJson: { skills: [] } }));
    // Sonuçlanmış satırlar sınırsızdır; başka kullanıcı etkilenmez.
    await upload(userId, { status: 'DISCARDED' });
    await upload(userId, { status: 'DISCARDED' });
    const other = await createUser(db);
    await upload(other, { status: 'QUEUED' });
  });
});

describe('profil kalemi kısıtları', () => {
  const position = (userId: string, data: Record<string, unknown> = {}) =>
    db.position.create({
      data: { userId, companyRaw: 'A', titleRaw: 'B', source: 'MANUAL', ...data } as never,
    });

  it('tarih alanları: ay 1–12, ay için yıl şart, yıl aralığı, bitiş ≥ başlangıç, süren kalemin bitişi yok', async () => {
    const userId = await createUser(db);
    await rejects(position(userId, { startYear: 2024, startMonth: 13 }));
    await rejects(position(userId, { startYear: 2024, startMonth: 0 }));
    await rejects(position(userId, { startMonth: 5 }));
    await rejects(position(userId, { startYear: 1949 }));
    await rejects(position(userId, { startYear: 2101 }));
    await rejects(position(userId, { startYear: 2024, startMonth: 9, endYear: 2024, endMonth: 7 }));
    await rejects(position(userId, { startYear: 2024, endYear: 2023 }));
    await rejects(position(userId, { startYear: 2024, isCurrent: true, endYear: 2025 }));
    await position(userId, { startYear: 2024, startMonth: 9, endYear: 2024, endMonth: 9 });
    await position(userId, { startYear: 2024, endYear: 2024 });
    await position(userId, { startYear: 2024, isCurrent: true });
    await position(userId, {});
  });

  it('eğitim ve sertifika tarihleri aynı kuralları taşır', async () => {
    const userId = await createUser(db);
    const education = (data: Record<string, unknown>) =>
      db.education.create({
        data: { userId, institution: 'Ü', source: 'MANUAL', ...data } as never,
      });
    await rejects(education({ startYear: 2024, endYear: 2020 }));
    await rejects(education({ isCurrent: true, startYear: 2020, endYear: 2024 }));
    await education({ startYear: 2020, endYear: 2024 });
    const certification = (data: Record<string, unknown>) =>
      db.certification.create({ data: { userId, name: 'S', source: 'MANUAL', ...data } as never });
    await rejects(certification({ issuedMonth: 13, issuedYear: 2024 }));
    await rejects(certification({ issuedMonth: 5 }));
    await certification({ issuedMonth: 5, issuedYear: 2024 });
  });

  it('metin uzunlukları sınırlıdır (LLM çıktısı sınırsız metin yazamaz)', async () => {
    const userId = await createUser(db);
    await rejects(position(userId, { companyRaw: '' }));
    await rejects(position(userId, { companyRaw: 'a'.repeat(201) }));
    await rejects(position(userId, { titleRaw: 'a'.repeat(201) }));
    await rejects(position(userId, { description: 'a'.repeat(1001) }));
    await position(userId, { companyRaw: 'a'.repeat(200), description: 'a'.repeat(1000) });
    await rejects(
      db.userSkill.create({
        data: { userId, name: 'a'.repeat(81), normalizedName: 'x', source: 'CV' },
      }),
    );
    await rejects(
      db.language.create({ data: { userId, name: '', normalizedName: 'x', source: 'CV' } }),
    );
  });

  it('dil ve beceri kullanıcı başına normalleştirilmiş ada göre benzersizdir; staj daveti pozisyon başına bir', async () => {
    const userId = await createUser(db);
    const other = await createUser(db);
    await db.language.create({
      data: { userId, name: 'İngilizce', normalizedName: 'ingilizce', source: 'CV' },
    });
    await rejects(
      db.language.create({
        data: { userId, name: 'ingilizce', normalizedName: 'ingilizce', source: 'MANUAL' },
      }),
    );
    await db.language.create({
      data: { userId: other, name: 'İngilizce', normalizedName: 'ingilizce', source: 'CV' },
    });
    await db.userSkill.create({
      data: { userId, name: 'SQL', normalizedName: 'sql', source: 'CV' },
    });
    await rejects(
      db.userSkill.create({ data: { userId, name: 'sql', normalizedName: 'sql', source: 'CV' } }),
    );
    const row = await position(userId);
    await db.experienceInvitation.create({ data: { userId, positionId: row.id } });
    await rejects(db.experienceInvitation.create({ data: { userId, positionId: row.id } }));
  });

  it('pozisyon silinince daveti de gider; sözlük kaydı silinince pozisyon kalır (bağ boşalır)', async () => {
    const userId = await createUser(db);
    const company = await db.company.create({
      data: { name: 'Geçici', normalizedName: `gecici-${randomUUID()}`, aliases: [] },
    });
    const row = await position(userId, { companyId: company.id });
    await db.experienceInvitation.create({ data: { userId, positionId: row.id } });
    await db.company.delete({ where: { id: company.id } });
    expect((await db.position.findUniqueOrThrow({ where: { id: row.id } })).companyId).toBeNull();
    await db.position.delete({ where: { id: row.id } });
    expect(await db.experienceInvitation.count({ where: { userId } })).toBe(0);
  });
});

describe('sözlükler', () => {
  it('normalleştirilmiş ad benzersizdir; yönetici kuyruğu (tür, değer) başına tektir ve sayacı ≥ 1', async () => {
    const normalizedName = `ad-${randomUUID()}`;
    await db.company.create({ data: { name: 'A', normalizedName, aliases: [] } });
    await rejects(db.company.create({ data: { name: 'B', normalizedName, aliases: [] } }));
    const normalizedValue = `deger-${randomUUID()}`;
    await db.unmatchedValue.create({ data: { kind: 'COMPANY', rawValue: 'X', normalizedValue } });
    await rejects(
      db.unmatchedValue.create({ data: { kind: 'COMPANY', rawValue: 'x', normalizedValue } }),
    );
    await db.unmatchedValue.create({ data: { kind: 'SKILL', rawValue: 'X', normalizedValue } });
    await rejects(
      db.unmatchedValue.create({
        data: { kind: 'TITLE', rawValue: 'X', normalizedValue: 'a', count: 0 },
      }),
    );
  });

  it('pg_trgm benzerlik dizinleri vardır ve benzerlik araması çalışır', async () => {
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname LIKE '%normalizedName_trgm' ORDER BY indexname`;
    expect(indexes.map((row) => row.indexname)).toEqual([
      'Company_normalizedName_trgm',
      'Sector_normalizedName_trgm',
      'Skill_normalizedName_trgm',
      'Title_normalizedName_trgm',
    ]);
    const [row] = await db.$queryRaw<
      { s: number }[]
    >`SELECT similarity('aselsan', 'aselsan elektronik')::float8 AS s`;
    expect(row?.s).toBeGreaterThan(0.3);
  });
});
