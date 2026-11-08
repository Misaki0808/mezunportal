import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Migration bekçisi — üretilmiş arama sütunları tuzağı (docs/engineering.md "Sürüm tuzakları").
 *
 * `Experience.searchVector` / `searchKeys` veritabanında GENERATED ALWAYS sütundur ve 6 GIN indeksi vardır (4 sözlük
 * trgm indeksi P1-05'te, 2 arama indeksi P1-08'de). Prisma bunları şemada tam modelleyemediği için `prisma migrate dev`
 * sonraki HER migration'a bunlar için yanlış `ALTER COLUMN`/`DROP INDEX` yazar; olduğu gibi uygulanırsa arama bozulur.
 * Bu test, onları yaratan migration'lar dışında bunlara dokunan migration'ı reddeder.
 */
const MIGRATIONS = new URL('./migrations/', import.meta.url);

/** Sütunları ve indeksleri bilerek yaratan migration'lar (yalnız bunlar dokunabilir). */
const CREATOR = '20261108010000_p1_08_search';
const GUARDED_INDEXES: Record<string, string> = {
  Company_normalizedName_trgm: '20261107234822_p1_05_cv',
  Title_normalizedName_trgm: '20261107234822_p1_05_cv',
  Skill_normalizedName_trgm: '20261107234822_p1_05_cv',
  Sector_normalizedName_trgm: '20261107234822_p1_05_cv',
  Experience_searchVector_idx: CREATOR,
  Experience_searchKeys_trgm: CREATOR,
};
const GUARDED_COLUMNS = ['searchVector', 'searchKeys'];

const FIX_HINT =
  'Prisma üretilmiş arama sütunları/indeksleri için yanlış SQL üretti. `prisma migrate dev --create-only` ile ' +
  'migration üret, bu satırları SQL dosyasından SİL, sonra uygula (docs/engineering.md "Sürüm tuzakları"). ' +
  'Bu sütun/indeksi bilerek değiştiriyorsan bekçi testindeki izin listesini gerekçeyle güncelle.';

/** `--` satır yorumlarını ve `/* *​/` bloklarını atar (geri alma notları yorumdadır). */
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

function violations(migration: string, sql: string): string[] {
  const found: string[] = [];
  for (const raw of stripComments(sql).split(';')) {
    const statement = raw.replace(/\s+/g, ' ').trim();
    if (!statement) continue;
    if (/^DROP INDEX\b/i.test(statement)) {
      for (const [index, creator] of Object.entries(GUARDED_INDEXES)) {
        if (migration !== creator && new RegExp(`"?${index}"?`).test(statement))
          found.push(`${migration}: ${index} indeksine DROP INDEX`);
      }
    }
    if (/^ALTER TABLE\b/i.test(statement) && migration !== CREATOR) {
      for (const column of GUARDED_COLUMNS) {
        if (new RegExp(`"${column}"`).test(statement))
          found.push(`${migration}: ${column} sütununa ALTER TABLE`);
      }
    }
  }
  return found;
}

describe('migration bekçisi: üretilmiş arama sütunları ve GIN indeksleri', () => {
  const names = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('migration klasörleri bulunur ve yaratıcı migration’lar vardır', () => {
    expect(names).toContain(CREATOR);
    for (const creator of new Set(Object.values(GUARDED_INDEXES))) expect(names).toContain(creator);
  });

  it('yaratıcılar dışında hiçbir migration bu sütun/indekslere dokunmaz', () => {
    const all = names.flatMap((name) =>
      violations(name, readFileSync(new URL(`${name}/migration.sql`, MIGRATIONS), 'utf8')),
    );
    expect(all, FIX_HINT).toEqual([]);
  });

  it('yaratıcı migration geçerlidir (yorumdaki geri alma notu yanlış alarm vermez)', () => {
    const sql = readFileSync(new URL(`${CREATOR}/migration.sql`, MIGRATIONS), 'utf8');
    expect(violations(CREATOR, sql)).toEqual([]);
    expect(
      violations(
        '20261107234822_p1_05_cv',
        readFileSync(new URL('20261107234822_p1_05_cv/migration.sql', MIGRATIONS), 'utf8'),
      ),
    ).toEqual([]);
  });

  it('Prisma’nın gerçek çıktısı yakalanır (bekçi kendini sınar)', () => {
    const bad = `-- DropIndex
DROP INDEX "Company_normalizedName_trgm";

-- DropIndex
DROP INDEX "Experience_searchKeys_trgm";

-- AlterTable
ALTER TABLE "Experience" ALTER COLUMN "searchVector" DROP DEFAULT,
ALTER COLUMN "searchKeys" SET DATA TYPE text;`;
    expect(violations('20270101000000_sonraki', bad)).toEqual([
      '20270101000000_sonraki: Company_normalizedName_trgm indeksine DROP INDEX',
      '20270101000000_sonraki: Experience_searchKeys_trgm indeksine DROP INDEX',
      '20270101000000_sonraki: searchVector sütununa ALTER TABLE',
      '20270101000000_sonraki: searchKeys sütununa ALTER TABLE',
    ]);
  });

  it('ilgisiz migration ve yorumdaki anma temiz geçer', () => {
    const ok = `-- DROP INDEX "Experience_searchKeys_trgm" (not)\nALTER TABLE "Experience" ADD COLUMN "other" text;\nDROP INDEX "Other_idx";`;
    expect(violations('20270101000000_sonraki', ok)).toEqual([]);
  });
});
