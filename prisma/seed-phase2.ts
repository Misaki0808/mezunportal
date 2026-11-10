import type { PrismaClient } from '../src/generated/prisma/client';
import { normalizeName } from '../src/server/rules/dictionary';
import { seedUserId } from './seed-accounts';
import { INSTITUTION_SEED } from './seed-data';
import { seedId } from './seed-util';

/**
 * Faz 2 DENEME VERİSİ (P2-14): kullanıcının telefonda hızlıca gezebileceği örnek içerik. SAHTE ve açıkça işaretlidir: şirket
 * adları "Örnek …" ile başlar (gerçek bir şirketi gösterdiği sanılmaz), yazarlar test hesaplarıdır, metinler örnektir.
 * Zamanlar ÇALIŞMA ANINA göredir (son başvuru tarihi gelecekte, yayın tarihi yakın geçmişte); bu yüzden yalnız bu modül saate bağlıdır
 * ve `now` verilebilir (test). İdempotenttir: kayıtlar sabit kimlikle upsert edilir, tekrar koşunca çoğalmaz, tarihler tazelenir.
 * Kapsam: şirket, yayınlanmış deneyim (arama, şirket sayfası, soru bankası, başvuru takvimi, beceri analizi buradan beslenir),
 * ilan (yayında/incelemede/taslak), etkinlik. Ders rehberi (P2-08) ve ödül/ay mezunu yayınları ana akışlarında (rıza + seçim)
 * yönetici ekranından denenir; seed rıza ya da seçim uydurmaz.
 */
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NS = 'phase2';

const COMPANIES = [
  {
    key: 'yazilim',
    name: 'Örnek Yazılım A.Ş.',
    sector: 'Bilişim ve Yazılım',
    aliases: ['Örnek Yazılım'],
  },
  {
    key: 'finans',
    name: 'Örnek Finans Teknolojileri',
    sector: 'Finans ve Bankacılık',
    aliases: [],
  },
  {
    key: 'perakende',
    name: 'Örnek Perakende Grubu',
    sector: 'Perakende ve E-ticaret',
    aliases: [],
  },
] as const;

type SeedExperience = {
  key: string;
  author: 'alumniMentor' | 'seniorMentor' | null;
  type: 'INTERNSHIP' | 'ERASMUS' | 'CLUB';
  company?: (typeof COMPANIES)[number]['key'];
  organizationName: string;
  country?: string;
  city?: string;
  termYear: number;
  termSeason: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  appliedMonth?: number;
  durationWeeks?: number;
  pay?: 'PAID' | 'UNPAID' | 'NOT_DISCLOSED';
  channel?:
    | 'LINKEDIN_POST'
    | 'CAREER_PLATFORM'
    | 'COMPANY_SITE'
    | 'REFERRAL'
    | 'CAREER_FAIR'
    | 'UNIVERSITY_ANNOUNCEMENT';
  steps: { title: string; description: string }[];
  questions: string[];
  learned: string;
  advice: string;
  publishedDaysAgo: number;
};

const EXPERIENCES: SeedExperience[] = [
  {
    key: 'yazilim-yaz',
    author: 'alumniMentor',
    type: 'INTERNSHIP',
    company: 'yazilim',
    organizationName: 'Örnek Yazılım A.Ş.',
    country: 'Türkiye',
    city: 'İstanbul',
    termYear: 2025,
    termSeason: 'SUMMER',
    appliedMonth: 3,
    durationWeeks: 8,
    pay: 'PAID',
    channel: 'LINKEDIN_POST',
    steps: [
      { title: 'Ön eleme', description: 'CV ve kısa bir form; iki gün içinde dönüş geldi.' },
      { title: 'Teknik görüşme', description: 'SQL ve algoritma soruları, otuz dakika.' },
      { title: 'İK görüşmesi', description: 'Motivasyon ve takvim konuşuldu.' },
    ],
    questions: [
      'İki tabloyu nasıl birleştirirsin?',
      'Bir veri hatasını nasıl bulursun?',
      'Neden bu şirket?',
    ],
    learned: 'Örnek veri: gerçek bir ekiple sprint planlamayı ve raporlama panolarını öğrendim.',
    advice: 'Örnek veri: SQL’i önceden çalış, görüşmede düşünme sürecini yüksek sesle anlat.',
    publishedDaysAgo: 40,
  },
  {
    key: 'yazilim-kis',
    author: 'seniorMentor',
    type: 'INTERNSHIP',
    company: 'yazilim',
    organizationName: 'Örnek Yazılım A.Ş.',
    country: 'Türkiye',
    city: 'İstanbul',
    termYear: 2026,
    termSeason: 'WINTER',
    appliedMonth: 10,
    durationWeeks: 6,
    pay: 'NOT_DISCLOSED',
    channel: 'CAREER_PLATFORM',
    steps: [
      { title: 'Çevrimiçi test', description: 'Mantık ve temel programlama, kırk dakika.' },
      { title: 'Ekip görüşmesi', description: 'Proje deneyimi ve ekip çalışması.' },
    ],
    questions: ['En son hangi projede takım çalışması yaptın?', 'Python mu Java mı, neden?'],
    learned: 'Örnek veri: test otomasyonuna ve kod incelemesine giriş.',
    advice: 'Örnek veri: başvuruyu son güne bırakma, test linki geç açılıyor.',
    publishedDaysAgo: 25,
  },
  {
    key: 'finans-yaz',
    author: 'alumniMentor',
    type: 'INTERNSHIP',
    company: 'finans',
    organizationName: 'Örnek Finans Teknolojileri',
    country: 'Türkiye',
    city: 'İstanbul',
    termYear: 2025,
    termSeason: 'SUMMER',
    appliedMonth: 2,
    durationWeeks: 10,
    pay: 'PAID',
    channel: 'CAREER_FAIR',
    steps: [
      { title: 'Kariyer fuarı tanışma', description: 'Fuarda kısa görüşme, CV bırakıldı.' },
      { title: 'Vaka çalışması', description: 'Küçük bir iş analizi vakası, bir hafta süre.' },
      { title: 'Panel görüşmesi', description: 'Üç kişilik panel, kırk beş dakika.' },
    ],
    questions: [
      'Bir süreci nasıl modellersin?',
      'Excel’de hangi işlevleri kullanırsın?',
      'Zor bir müşteriyle nasıl çalışırsın?',
    ],
    learned: 'Örnek veri: iş analizi belgeleri ve paydaş toplantıları.',
    advice: 'Örnek veri: vaka çalışmasını sunum gibi hazırla, rakamları kendi cümlenle anlat.',
    publishedDaysAgo: 60,
  },
  {
    key: 'perakende-yaz',
    author: null,
    type: 'INTERNSHIP',
    company: 'perakende',
    organizationName: 'Örnek Perakende Grubu',
    country: 'Türkiye',
    city: 'Ankara',
    termYear: 2024,
    termSeason: 'SUMMER',
    appliedMonth: 4,
    durationWeeks: 6,
    pay: 'UNPAID',
    channel: 'UNIVERSITY_ANNOUNCEMENT',
    steps: [{ title: 'Başvuru formu', description: 'Okulun duyurusundaki forma başvuruldu.' }],
    questions: ['Neden perakende?', 'Haftada kaç gün çalışabilirsin?'],
    learned: 'Örnek veri (anonim): stok ve satış raporlarına bakmayı öğrendim.',
    advice: 'Örnek veri (anonim): ücretsiz stajda süreyi baştan netleştir.',
    publishedDaysAgo: 90,
  },
  {
    key: 'erasmus',
    author: 'seniorMentor',
    type: 'ERASMUS',
    organizationName: 'Örnek Avrupa Üniversitesi',
    country: 'Almanya',
    city: 'Münih',
    termYear: 2025,
    termSeason: 'AUTUMN',
    durationWeeks: 20,
    channel: 'UNIVERSITY_ANNOUNCEMENT',
    steps: [
      { title: 'Okul içi başvuru', description: 'Dil belgesi ve not ortalaması istendi.' },
      { title: 'Mülakat', description: 'Kısa İngilizce görüşme.' },
    ],
    questions: [],
    learned: 'Örnek veri: farklı bir eğitim sistemi ve bütçe planlama.',
    advice:
      'Örnek veri: dil belgesini erken al, ders eşleştirmeyi başvuru öncesi danışmanla netleştir.',
    publishedDaysAgo: 30,
  },
  {
    key: 'kulup',
    author: 'alumniMentor',
    type: 'CLUB',
    organizationName: 'Örnek YBS Öğrenci Kulübü',
    termYear: 2024,
    termSeason: 'AUTUMN',
    steps: [],
    questions: [],
    learned: 'Örnek veri: etkinlik organizasyonu ve sponsor yazışmaları.',
    advice: 'Örnek veri: küçük bir göreve gönüllü ol, sorumluluk sonradan büyür.',
    publishedDaysAgo: 15,
  },
];

type SeedPosting = {
  key: string;
  kind: 'INTERNSHIP' | 'JOB';
  title: string;
  company?: (typeof COMPANIES)[number]['key'];
  organizationName: string;
  location: string | null;
  isRemote: boolean;
  description: string;
  applyMethod: 'URL' | 'CONTACT_REQUEST';
  applyUrl: string | null;
  deadlineInDays: number;
  grades: number[];
  tags: string[];
  state: 'PUBLISHED' | 'PENDING' | 'DRAFT';
};

const POSTINGS: SeedPosting[] = [
  {
    key: 'veri-analizi-staj',
    kind: 'INTERNSHIP',
    title: 'Veri Analizi Stajyeri (örnek ilan)',
    company: 'yazilim',
    organizationName: 'Örnek Yazılım A.Ş.',
    location: 'İstanbul',
    isRemote: false,
    description:
      'Örnek ilan: raporlama ekibinde SQL ve Excel ile veri analizi yapacak, haftalık panoları hazırlayacak bir stajyer arıyoruz. Bu metin deneme içindir.',
    applyMethod: 'URL',
    applyUrl: 'https://ornek.example/veri-analizi-staj',
    deadlineInDays: 21,
    grades: [3, 4],
    tags: ['data', 'software'],
    state: 'PUBLISHED',
  },
  {
    key: 'is-analizi-staj',
    kind: 'INTERNSHIP',
    title: 'İş Analizi Stajyeri (örnek ilan)',
    company: 'finans',
    organizationName: 'Örnek Finans Teknolojileri',
    location: 'İstanbul',
    isRemote: true,
    description:
      'Örnek ilan: iş analistlerine eşlik edip süreç haritaları ve gereksinim belgeleri hazırlayacak. Başvuru için ilan sahibine iletişim talebi gönderilir.',
    applyMethod: 'CONTACT_REQUEST',
    applyUrl: null,
    deadlineInDays: 35,
    grades: [2, 3, 4],
    tags: ['business', 'project'],
    state: 'PUBLISHED',
  },
  {
    key: 'erp-junior',
    kind: 'JOB',
    title: 'Junior ERP Danışmanı (örnek ilan)',
    company: 'yazilim',
    organizationName: 'Örnek Yazılım A.Ş.',
    location: null,
    isRemote: true,
    description:
      'Örnek ilan: yeni mezun için ERP kurulum ve eğitim projelerinde görev; SAP bilgisi artı. Bu metin deneme içindir ve gerçek bir iş ilanı değildir.',
    applyMethod: 'URL',
    applyUrl: 'https://ornek.example/erp-junior',
    deadlineInDays: 50,
    grades: [4],
    tags: ['erp'],
    state: 'PUBLISHED',
  },
  {
    key: 'urun-staj-incelemede',
    kind: 'INTERNSHIP',
    title: 'Ürün Yönetimi Stajyeri (inceleme bekliyor)',
    company: 'perakende',
    organizationName: 'Örnek Perakende Grubu',
    location: 'Ankara',
    isRemote: false,
    description:
      'Örnek ilan: moderatör ekranını denemek için incelemede bekliyor. Ürün ekibiyle kullanıcı görüşmelerine ve öncelik listesine yardım edecek.',
    applyMethod: 'URL',
    applyUrl: 'https://ornek.example/urun-staj',
    deadlineInDays: 28,
    grades: [3],
    tags: ['product'],
    state: 'PENDING',
  },
  {
    key: 'pazarlama-taslak',
    kind: 'INTERNSHIP',
    title: 'Dijital Pazarlama Stajyeri (taslak)',
    organizationName: 'Örnek Perakende Grubu',
    location: null,
    isRemote: false,
    description: '',
    applyMethod: 'URL',
    applyUrl: null,
    deadlineInDays: 14,
    grades: [],
    tags: ['marketing'],
    state: 'DRAFT',
  },
];

const startOfIstanbulDay = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
};

export async function seedPhase2(prisma: PrismaClient, now: Date = new Date()) {
  const department = await prisma.department.findFirstOrThrow({
    where: { code: INSTITUTION_SEED.department.code },
    select: { id: true },
  });
  const moderator = seedUserId('departmentAdmin');
  const today = startOfIstanbulDay(now);

  // Şirketler (sektör sözlükten; sözlük seed'i önce koşar).
  const companyIds = new Map<string, string>();
  for (const company of COMPANIES) {
    const sector = await prisma.sector.findUnique({
      where: { normalizedName: normalizeName(company.sector, 'SECTOR') },
      select: { id: true },
    });
    const id = seedId(NS, `company:${company.key}`);
    const data = {
      name: company.name,
      normalizedName: normalizeName(company.name, 'COMPANY'),
      aliases: company.aliases.map((alias) => normalizeName(alias, 'COMPANY')),
      sectorId: sector?.id ?? null,
    };
    await prisma.company.upsert({ where: { id }, create: { id, ...data }, update: data });
    companyIds.set(company.key, id);
  }

  // Yayınlanmış deneyimler.
  for (const e of EXPERIENCES) {
    const id = seedId(NS, `experience:${e.key}`);
    const publishedAt = new Date(now.getTime() - e.publishedDaysAgo * DAY);
    const data = {
      authorId: e.author ? seedUserId(e.author) : null,
      departmentIdAtWrite: department.id,
      type: e.type,
      companyId: e.company ? companyIds.get(e.company)! : null,
      organizationName: e.organizationName,
      country: e.country ?? null,
      city: e.city ?? null,
      termYear: e.termYear,
      termSeason: e.termSeason,
      appliedMonth: e.appliedMonth ?? null,
      durationWeeks: e.durationWeeks ?? null,
      pay: e.pay ?? null,
      applicationChannel: e.channel ?? null,
      processSteps: e.steps,
      interviewQuestions: e.questions,
      whatLearned: e.learned,
      advice: e.advice,
      isAnonymous: e.author === null,
      status: 'PUBLISHED' as const,
      moderatedById: moderator,
      moderatedAt: publishedAt,
      publishedAt,
    };
    await prisma.experience.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // İlanlar.
  const alumni = seedUserId('alumniMentor');
  for (const p of POSTINGS) {
    const id = seedId(NS, `posting:${p.key}`);
    const published = p.state === 'PUBLISHED';
    const submitted = p.state !== 'DRAFT';
    const publishedAt = published ? new Date(now.getTime() - 2 * DAY) : null;
    const data = {
      authorId: alumni,
      departmentIdAtWrite: department.id,
      kind: p.kind,
      title: p.title,
      companyId: p.company ? companyIds.get(p.company)! : null,
      organizationName: p.organizationName,
      location: p.location,
      isRemote: p.isRemote,
      description: p.description === '' ? null : p.description,
      applyMethod: p.state === 'DRAFT' ? null : p.applyMethod,
      applyUrl: p.state === 'DRAFT' ? null : p.applyUrl,
      deadlineOn: new Date(today.getTime() + p.deadlineInDays * DAY),
      targetGrades: p.grades,
      status: p.state,
      submittedAt: submitted ? new Date(now.getTime() - 3 * DAY) : null,
      moderatedById: published ? moderator : null,
      moderatedAt: published ? publishedAt : null,
      publishedAt,
    };
    await prisma.jobPosting.upsert({ where: { id }, create: { id, ...data }, update: data });
    await prisma.jobPostingDepartment.upsert({
      where: { postingId_departmentId: { postingId: id, departmentId: department.id } },
      create: { postingId: id, departmentId: department.id },
      update: {},
    });
    for (const slug of p.tags) {
      const tag = await prisma.tag.findUnique({
        where: { kind_slug: { kind: 'INTEREST', slug } },
        select: { id: true },
      });
      if (!tag) continue;
      await prisma.jobPostingTag.upsert({
        where: { postingId_tagId: { postingId: id, tagId: tag.id } },
        create: { postingId: id, tagId: tag.id },
        update: {},
      });
    }
  }

  // Etkinlikler: biri yayında (yakında), biri incelemede (moderatör ekranı denemesi).
  const events = [
    {
      key: 'kariyer-sohbeti',
      title: 'YBS Kariyer Sohbeti (örnek etkinlik)',
      description:
        'Örnek etkinlik: mezunlarla staj ve ilk iş üzerine sohbet. Katılım kodu etkinlik başlayınca açılır.',
      location: 'İktisat Fakültesi, Amfi 2',
      inDays: 7,
      status: 'PUBLISHED' as const,
    },
    {
      key: 'cv-atolyesi',
      title: 'CV Atölyesi (inceleme bekliyor)',
      description:
        'Örnek etkinlik: moderatör onayını denemek için incelemede bekliyor. CV’ni mezunlarla birlikte gözden geçir.',
      location: 'İktisat Fakültesi, Bilgisayar Laboratuvarı',
      inDays: 14,
      status: 'PENDING' as const,
    },
  ];
  for (const event of events) {
    const id = seedId(NS, `event:${event.key}`);
    const startsAt = new Date(today.getTime() + event.inDays * DAY + 11 * HOUR);
    const published = event.status === 'PUBLISHED';
    const data = {
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      capacity: 40,
      status: event.status,
      createdById: seedUserId('departmentAdmin'),
      reviewedById: published ? seedUserId('systemAdmin') : null,
      reviewedAt: published ? new Date(now.getTime() - DAY) : null,
    };
    await prisma.campusEvent.upsert({ where: { id }, create: { id, ...data }, update: data });
    await prisma.campusEventDepartment.upsert({
      where: { eventId_departmentId: { eventId: id, departmentId: department.id } },
      create: { eventId: id, departmentId: department.id },
      update: {},
    });
  }
}
