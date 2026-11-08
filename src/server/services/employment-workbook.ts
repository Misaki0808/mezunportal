import 'server-only';

import ExcelJS from 'exceljs';

import {
  EMPLOYMENT_COUNTING_RULE,
  EMPLOYMENT_EXPORT_SHEETS,
  type EmploymentReport,
} from '@/contracts/admin';

/**
 * Mezun istihdam raporunu `.xlsx` yapar (UTF-8; Türkçe karakterler olduğu gibi). Dosyada YALNIZ toplu sayılar
 * vardır: kişi satırı, e-posta, telefon ya da ad yoktur; sayfalar `EMPLOYMENT_EXPORT_SHEETS`'tir. Hücre değerleri
 * metin olarak yazılır (formül değil), bu yüzden `=` ile başlayan bir sözlük adı formül olarak çalışmaz.
 */

export const UNKNOWN_LABEL = 'Bilinmeyen (sözlükte yok)';
export const OTHER_LABEL = 'Diğer (küçük gruplar)';

const COUNTING_RULE_TEXT: Record<typeof EMPLOYMENT_COUNTING_RULE, string> = {
  CURRENT_OR_LATEST_POSITION:
    'Her mezun bir kez sayılır; güncel pozisyonu (yoksa en son biten pozisyonu) esas alınır. Yalnız sözlükle eşleşen adlar gösterilir.',
};

export type WorkbookMeta = {
  /** Kapsam özeti (ör. bölüm adları ya da "12 bölüm"); kişisel veri içermez. */
  scopeLabel: string;
  graduationYearFrom?: number | undefined;
  graduationYearTo?: number | undefined;
};

export async function buildEmploymentWorkbook(
  report: EmploymentReport,
  meta: WorkbookMeta,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MezunPortal';
  workbook.created = report.generatedAt;
  workbook.modified = report.generatedAt;

  for (const definition of EMPLOYMENT_EXPORT_SHEETS) {
    const sheet = workbook.addWorksheet(definition.name);
    sheet.addRow([...definition.columns]);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns = [{ width: 48 }, { width: 18 }];

    if (!('dimension' in definition)) {
      const years =
        meta.graduationYearFrom === undefined && meta.graduationYearTo === undefined
          ? 'Tümü'
          : `${meta.graduationYearFrom ?? '…'} – ${meta.graduationYearTo ?? '…'}`;
      sheet.addRows([
        ['Oluşturulma zamanı', report.generatedAt.toISOString()],
        ['Kapsam', meta.scopeLabel],
        ['Mezuniyet yılı', years],
        ['Kapsamdaki mezun sayısı', report.totalAlumni],
        ['Pozisyonu olan mezun sayısı', report.alumniWithPosition],
        ['Küçük grup eşiği', report.minGroupSize],
        ['Sayım kuralı', COUNTING_RULE_TEXT[EMPLOYMENT_COUNTING_RULE]],
        [
          'Not',
          `${report.minGroupSize} kişiden küçük gruplar tek tek gösterilmez; "Diğer" satırında birleşir ya da hiç yer almaz.`,
        ],
      ]);
      continue;
    }
    for (const bucket of report.distributions[definition.dimension]) {
      const label =
        bucket.type === 'NAMED'
          ? (bucket.label ?? '')
          : bucket.type === 'UNKNOWN'
            ? UNKNOWN_LABEL
            : OTHER_LABEL;
      sheet.addRow([label, bucket.count]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
