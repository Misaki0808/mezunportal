import type { PrismaClient } from '../src/generated/prisma/client';
import { normalizeName } from '../src/server/rules/dictionary';

/**
 * Pilot sözlük başlangıç seti (TD-011): YBS pilotu için sektör, unvan ve beceri. ŞİRKET YAZILMAZ: şirketler gerçek
 * CV'lerden gelen `UnmatchedValue` kuyruğundan yönetici ekranıyla ("yeni kayıt") eklenir; uydurma eşleme olmaz.
 * Takma adlar `normalizeName` ile saklanır (eşleme bunları arar). Tekrar koşulabilir: kayıt `normalizedName` ile
 * bulunur, varsa DOKUNULMAZ (yöneticinin düzenlemesi ezilmez); başka bir kaydın adı/takma adıyla çakışan takma ad atlanır.
 */
export const DICTIONARY_SEED = {
  SECTOR: [
    'Bilişim ve Yazılım',
    'Finans ve Bankacılık',
    'Perakende ve E-ticaret',
    'Danışmanlık',
    'Üretim ve Sanayi',
    'Telekomünikasyon',
    'Sağlık',
    'Kamu',
    'Lojistik ve Taşımacılık',
    'Savunma ve Havacılık',
  ],
  TITLE: [
    ['Stajyer', 'Intern', 'Internship', 'Staj'],
    ['İş Analisti', 'Business Analyst'],
    ['Veri Analisti', 'Data Analyst'],
    [
      'Yazılım Geliştirici',
      'Software Developer',
      'Software Engineer',
      'Yazılım Mühendisi',
      'Developer',
    ],
    ['Proje Yöneticisi', 'Project Manager', 'Proje Müdürü'],
    ['Ürün Yöneticisi', 'Product Manager', 'Product Owner'],
    ['Danışman', 'Consultant'],
    ['ERP Danışmanı', 'SAP Danışmanı', 'SAP Consultant', 'ERP Consultant'],
    ['Sistem Analisti', 'Systems Analyst', 'System Analyst'],
    ['İş Zekâsı Uzmanı', 'BI Uzmanı', 'BI Analyst', 'Business Intelligence Specialist'],
    ['Test Mühendisi', 'QA Engineer', 'Test Engineer', 'Kalite Güvence Mühendisi'],
    ['Müşteri Temsilcisi', 'Customer Representative', 'Customer Service Representative'],
    ['Dijital Pazarlama Uzmanı', 'Digital Marketing Specialist'],
    ['İnsan Kaynakları Uzmanı', 'İK Uzmanı', 'HR Specialist'],
    ['Finans Uzmanı', 'Finance Specialist', 'Muhasebe Uzmanı'],
  ],
  SKILL: [
    ['SQL'],
    ['Python', 'Py'],
    ['Excel', 'Microsoft Excel', 'MS Excel'],
    ['Power BI', 'PowerBI'],
    ['SAP'],
    ['JavaScript', 'JS'],
    ['Java'],
    ['İş Analizi', 'Business Analysis'],
    ['Proje Yönetimi', 'Project Management'],
    ['Veri Analizi', 'Data Analysis'],
    ['Tableau'],
    ['Agile/Scrum', 'Agile', 'Scrum'],
    ['UML/BPMN', 'UML', 'BPMN'],
    ['R'],
  ],
} as const;

type Entry = { name: string; aliases: readonly string[] };
const entries = (list: readonly (string | readonly string[])[]): Entry[] =>
  list.map((item) =>
    typeof item === 'string'
      ? { name: item, aliases: [] }
      : { name: item[0]!, aliases: item.slice(1) },
  );

export async function seedDictionary(db: PrismaClient) {
  for (const sector of DICTIONARY_SEED.SECTOR) {
    const normalizedName = normalizeName(sector, 'SECTOR');
    await db.sector.upsert({
      where: { normalizedName },
      create: { name: sector, normalizedName },
      update: {},
    });
  }
  const adapters = {
    TITLE: {
      rows: () => db.title.findMany({ select: { normalizedName: true, aliases: true } }),
      exists: async (normalizedName: string) =>
        (await db.title.count({ where: { normalizedName } })) > 0,
      create: (data: { name: string; normalizedName: string; aliases: string[] }) =>
        db.title.create({ data }),
    },
    SKILL: {
      rows: () => db.skill.findMany({ select: { normalizedName: true, aliases: true } }),
      exists: async (normalizedName: string) =>
        (await db.skill.count({ where: { normalizedName } })) > 0,
      create: (data: { name: string; normalizedName: string; aliases: string[] }) =>
        db.skill.create({ data }),
    },
  } as const;
  for (const kind of ['TITLE', 'SKILL'] as const) {
    const adapter = adapters[kind];
    // Mevcut ad ve takma adlar: çakışan takma ad atlanır, eşleme tek anlamlı kalır.
    const taken = new Set<string>();
    for (const row of await adapter.rows()) {
      taken.add(row.normalizedName);
      for (const alias of row.aliases) taken.add(alias);
    }
    for (const entry of entries(DICTIONARY_SEED[kind])) {
      const normalizedName = normalizeName(entry.name, kind);
      if (await adapter.exists(normalizedName)) continue;
      const aliases = [...new Set(entry.aliases.map((alias) => normalizeName(alias, kind)))].filter(
        (alias) => alias !== '' && alias !== normalizedName && !taken.has(alias),
      );
      await adapter.create({ name: entry.name, normalizedName, aliases });
      taken.add(normalizedName);
      for (const alias of aliases) taken.add(alias);
    }
  }
}
