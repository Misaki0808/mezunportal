import type { ParsedCv } from '@/contracts/cv';

import { buildTestPdf, type TestPdfOptions } from './pdf';

/**
 * Sentetik örnek CV'ler (P1-05 kabul: 5 örnek, biri LinkedIn PDF dışa aktarımı, biri taranmış). Kişiler,
 * şirketler ve okullar UYDURMADIR; gerçek kişi verisi yoktur. `expected`, CV'nin DOĞRU okunmuş halidir (yer
 * gerçeği). Sahte adaptör bu çıktıyı senaryo kimliğiyle verir; GERÇEK sağlayıcı adaptörü (K-04) geldiğinde aynı
 * örnekler `cv-accuracy.db.test.ts` ile gerçek çıktıya karşı ölçülür ve doğruluk tablosu o zaman anlamlı olur.
 */
export type CvSample = {
  id: string;
  label: string;
  kind: 'standard' | 'linkedin-export' | 'scanned' | 'alumni' | 'sparse';
  pdf: TestPdfOptions;
  expected: ParsedCv;
};

const sample = (
  id: string,
  label: string,
  kind: CvSample['kind'],
  expected: Partial<ParsedCv>,
  pdf: Omit<TestPdfOptions, 'scenario'> = {},
): CvSample => ({
  id,
  label,
  kind,
  pdf: { ...pdf, scenario: id },
  expected: {
    profile: { headline: null, summary: null, city: null },
    education: [],
    positions: [],
    skills: [],
    languages: [],
    certifications: [],
    ...expected,
  },
});

export const CV_SAMPLES: readonly CvSample[] = [
  sample(
    'ornek-ayse',
    'Standart öğrenci CV’si (metin katmanlı, 2 sayfa)',
    'standard',
    {
      education: [
        {
          institution: 'Örnek Üniversitesi',
          level: 'BACHELOR',
          fieldOfStudy: 'Yönetim Bilişim Sistemleri',
          startDate: '2021-09',
          endDate: null,
          isCurrent: true,
        },
      ],
      positions: [
        {
          company: 'Deneme Yazılım A.Ş.',
          title: 'Yazılım Stajyeri',
          employmentType: 'INTERNSHIP',
          startDate: '2024-07',
          endDate: '2024-09',
          isCurrent: false,
          description: 'Kurum içi raporlama ekranlarını geliştirdim.',
        },
        {
          company: 'Kurgu Teknoloji Ltd. Şti.',
          title: 'İş Analizi Stajyeri',
          employmentType: 'INTERNSHIP',
          startDate: '2023-07',
          endDate: '2023-08',
          isCurrent: false,
          description: null,
        },
      ],
      skills: ['TypeScript', 'SQL', 'Excel', 'Power BI', 'Git'],
      languages: [
        { name: 'Türkçe', level: 'NATIVE' },
        { name: 'İngilizce', level: 'B2' },
      ],
      certifications: [
        { name: 'Veri Analizi Temelleri', issuer: 'Örnek Akademi', issuedDate: '2024-05' },
      ],
    },
    { pages: 2, text: ['Ayşe Örnek', 'Örnek Üniversitesi'] },
  ),
  sample(
    'ornek-can-linkedin',
    'LinkedIn PDF dışa aktarımı (Experience / Education / Skills / Languages bölümleri)',
    'linkedin-export',
    {
      education: [
        {
          institution: 'Örnek Üniversitesi',
          level: 'BACHELOR',
          fieldOfStudy: 'İşletme',
          startDate: '2018',
          endDate: '2022',
          isCurrent: false,
        },
      ],
      positions: [
        {
          company: 'Kurgu Teknoloji',
          title: 'Ürün Analisti',
          employmentType: 'FULL_TIME',
          startDate: '2023-02',
          endDate: null,
          isCurrent: true,
          description: 'Ürün metriklerini izleyip haftalık rapor hazırlıyorum.',
        },
        {
          company: 'Deneme Danışmanlık',
          title: 'Kıdemsiz Danışman',
          employmentType: 'FULL_TIME',
          startDate: '2022-06',
          endDate: '2023-01',
          isCurrent: false,
          description: null,
        },
      ],
      skills: ['Ürün Yönetimi', 'SQL', 'A/B Testi', 'Analitik'],
      languages: [
        { name: 'Türkçe', level: 'NATIVE' },
        { name: 'İngilizce', level: 'C1' },
        { name: 'Almanca', level: 'A2' },
      ],
      certifications: [
        { name: 'Ürün Yönetimi Sertifikası', issuer: 'Örnek Akademi', issuedDate: '2023-03' },
        { name: 'SQL ile Veri Analizi', issuer: 'Kurgu Eğitim', issuedDate: '2022-11' },
      ],
    },
    {
      pages: 3,
      text: [
        'Can Deneme',
        'Contact',
        'Experience',
        'Education',
        'Skills',
        'Languages',
        'Certifications',
      ],
    },
  ),
  sample(
    'ornek-elif-mezun',
    'Mezun CV’si (lisans + yüksek lisans, üç tam zamanlı pozisyon, ay bilgisi yok)',
    'alumni',
    {
      education: [
        {
          institution: 'Örnek Üniversitesi',
          level: 'BACHELOR',
          fieldOfStudy: 'Yönetim Bilişim Sistemleri',
          startDate: '2012',
          endDate: '2016',
          isCurrent: false,
        },
        {
          institution: 'Kurgu Üniversitesi',
          level: 'MASTER',
          fieldOfStudy: 'Veri Bilimi',
          startDate: '2017',
          endDate: '2019',
          isCurrent: false,
        },
      ],
      positions: [
        {
          company: 'Deneme Yazılım',
          title: 'Kıdemli Veri Analisti',
          employmentType: 'FULL_TIME',
          startDate: '2021',
          endDate: null,
          isCurrent: true,
          description: null,
        },
        {
          company: 'Kurgu Teknoloji',
          title: 'Veri Analisti',
          employmentType: 'FULL_TIME',
          startDate: '2019',
          endDate: '2021',
          isCurrent: false,
          description: null,
        },
        {
          company: 'Örnek Holding',
          title: 'İş Zekâsı Uzmanı',
          employmentType: 'FULL_TIME',
          startDate: '2016',
          endDate: '2017',
          isCurrent: false,
          description: null,
        },
      ],
      skills: ['Python', 'SQL', 'Tableau', 'Makine Öğrenmesi'],
      languages: [{ name: 'İngilizce', level: 'C1' }],
      certifications: [],
    },
    { pages: 2, text: ['Elif Mezun'] },
  ),
  sample(
    'ornek-mert-tarama',
    'Taranmış CV (metin katmanı yok; yalnız görüntü)',
    'scanned',
    {
      education: [
        {
          institution: 'Örnek Üniversitesi',
          level: 'BACHELOR',
          fieldOfStudy: 'Yönetim Bilişim Sistemleri',
          startDate: '2020',
          endDate: null,
          isCurrent: true,
        },
      ],
      positions: [
        {
          company: 'Deneme Yazılım',
          title: 'Stajyer',
          employmentType: 'INTERNSHIP',
          startDate: '2023-07',
          endDate: '2023-08',
          isCurrent: false,
          description: null,
        },
      ],
      skills: ['Excel'],
    },
    { pages: 1 },
  ),
  sample(
    'ornek-zeynep-eksik',
    'Seyrek CV (tarihsiz, kısa; model bilinmeyeni boş bırakmalı)',
    'sparse',
    {
      positions: [
        {
          company: 'Kurgu Teknoloji',
          title: 'Yarı Zamanlı Destek Elemanı',
          employmentType: 'PART_TIME',
          startDate: null,
          endDate: null,
          isCurrent: false,
          description: null,
        },
      ],
      skills: ['İletişim'],
      languages: [{ name: 'İngilizce', level: null }],
    },
    { pages: 1, text: ['Zeynep Eksik'] },
  ),
];

export const CV_SAMPLE_OUTPUTS: Readonly<Record<string, ParsedCv>> = Object.fromEntries(
  CV_SAMPLES.map((entry) => [entry.id, entry.expected]),
);

export const cvSamplePdf = (entry: CvSample) => buildTestPdf(entry.pdf);
