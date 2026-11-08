import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Migration bekçisi — üretilmiş arama sütunları tuzağı (docs/engineering.md "Sürüm tuzakları").
 *
 * `Experience.searchVector` / `searchKeys` (P1-17'den beri `FaqItem`, P2-04'ten beri `JobPosting` için aynı ad) veritabanında
 * GENERATED ALWAYS sütundur ve 10 GIN indeksi vardır (4 sözlük trgm indeksi P1-05'te, 2 deneyim arama indeksi P1-08'de, 2 SSS
 * arama indeksi P1-17'de, 2 ilan arama indeksi P2-04'te). Prisma bunları şemada tam modelleyemediği için `prisma migrate dev`
 * sonraki HER migration'a bunlar için yanlış `ALTER COLUMN`/`DROP INDEX` yazar; olduğu gibi uygulanırsa arama bozulur.
 * Bu test, onları yaratan migration’lar dışında bunlara dokunan migration’ı reddeder. Artık şemada modelli olduğundan
 * `migrate dev` normalde sürüklenmez; bu test İKİNCİ KEMERDİR (docs/decisions.md).
 */
const MIGRATIONS = new URL('./migrations/', import.meta.url);

/** Sütunları ve indeksleri bilerek yaratan migration'lar (yalnız bunlar dokunabilir). */
const CREATOR = '20261108010000_p1_08_search';
const FAQ_CREATOR = '20261108160100_p1_17_faq';
const JOB_CREATOR = '20261109000000_p2_04_job_posting';
/** Her oluşturucu yalnız kendi tablosuna GENERATED sütunu ekleyebilir. */
const COLUMN_CREATORS: Record<string, string> = {
  [CREATOR]: 'Experience',
  [FAQ_CREATOR]: 'FaqItem',
  [JOB_CREATOR]: 'JobPosting',
};
const GUARDED_INDEXES: Record<string, string> = {
  Company_normalizedName_trgm: '20261107234822_p1_05_cv',
  Title_normalizedName_trgm: '20261107234822_p1_05_cv',
  Skill_normalizedName_trgm: '20261107234822_p1_05_cv',
  Sector_normalizedName_trgm: '20261107234822_p1_05_cv',
  Experience_searchVector_idx: CREATOR,
  Experience_searchKeys_trgm: CREATOR,
  FaqItem_searchVector_idx: FAQ_CREATOR,
  FaqItem_searchKeys_trgm: FAQ_CREATOR,
  JobPosting_searchVector_idx: JOB_CREATOR,
  JobPosting_searchKeys_trgm: JOB_CREATOR,
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
      for (const index of Object.keys(GUARDED_INDEXES)) {
        if (new RegExp(`"?${index}"?`).test(statement))
          found.push(`${migration}: ${index} indeksine DROP INDEX`);
      }
    }
    if (/^ALTER TABLE\b/i.test(statement)) {
      for (const column of GUARDED_COLUMNS) {
        if (!new RegExp(`"${column}"`).test(statement)) continue;
        const creatorTable = COLUMN_CREATORS[migration];
        const ownAdd =
          creatorTable &&
          new RegExp(`^ALTER TABLE "${creatorTable}" ADD COLUMN "${column}"\\s`, 'i').test(
            statement,
          ) &&
          /\bGENERATED ALWAYS AS\b/i.test(statement) &&
          /\bSTORED$/i.test(statement) &&
          !/,\s*(?:ALTER|DROP|ADD|RENAME)\s+(?:COLUMN|CONSTRAINT)\b/i.test(statement);
        if (!ownAdd) found.push(`${migration}: ${column} sütununa ALTER TABLE`);
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

  it('SSS arama sütunları/indeksleri de korunur; yaratıcı migration geçerlidir', () => {
    const sql = readFileSync(new URL(`${FAQ_CREATOR}/migration.sql`, MIGRATIONS), 'utf8');
    expect(violations(FAQ_CREATOR, sql)).toEqual([]);
    expect(
      violations(
        '20990101000000_x',
        'ALTER TABLE "FaqItem" ALTER COLUMN "searchVector" DROP DEFAULT; DROP INDEX "FaqItem_searchKeys_trgm";',
      ),
    ).toHaveLength(2);
  });

  it('ilan arama sütunları/indeksleri de korunur; yaratıcı migration geçerlidir', () => {
    const sql = readFileSync(new URL(`${JOB_CREATOR}/migration.sql`, MIGRATIONS), 'utf8');
    expect(violations(JOB_CREATOR, sql)).toEqual([]);
    expect(
      violations(
        '20990101000000_x',
        'ALTER TABLE "JobPosting" ALTER COLUMN "searchKeys" DROP DEFAULT; DROP INDEX "JobPosting_searchVector_idx";',
      ),
    ).toHaveLength(2);
    // yaratıcı yalnız KENDİ tablosuna ekleyebilir
    expect(
      violations(JOB_CREATOR, 'ALTER TABLE "FaqItem" ALTER COLUMN "searchKeys" DROP DEFAULT;'),
    ).toHaveLength(1);
    expect(
      violations(FAQ_CREATOR, 'ALTER TABLE "JobPosting" ALTER COLUMN "searchVector" DROP DEFAULT;'),
    ).toHaveLength(1);
  });

  it('oluşturucu istisnası farklı tabloyu ve kendi sütununun ALTER/DROP işlemini kapsamaz', () => {
    expect(
      violations(FAQ_CREATOR, 'ALTER TABLE "Experience" ALTER COLUMN "searchKeys" DROP DEFAULT;'),
    ).toHaveLength(1);
    expect(
      violations(CREATOR, 'ALTER TABLE "FaqItem" ALTER COLUMN "searchVector" DROP DEFAULT;'),
    ).toHaveLength(1);
    expect(
      violations(FAQ_CREATOR, 'ALTER TABLE "FaqItem" ALTER COLUMN "searchKeys" DROP DEFAULT;'),
    ).toHaveLength(1);
    expect(violations(FAQ_CREATOR, 'DROP INDEX "FaqItem_searchKeys_trgm";')).toHaveLength(1);
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
