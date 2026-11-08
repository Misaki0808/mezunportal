import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { EVENT_PROPS_SCHEMAS } from '@/contracts/metrics';
import { buildUsageWorkbook } from './usage-metrics';

describe('bağımsız kişisel veri ve Excel denemeleri', () => {
  it('sabit alanlara kişisel veri ve ek anahtar sığdırılamaz', () => {
    for (const value of [
      'sahte@example.invalid',
      '05321234567',
      'Ayşe Deneme',
      'serbest arama metni',
    ]) {
      expect(
        EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: [value], results: 'FEW' }).success,
      ).toBe(false);
      expect(
        EVENT_PROPS_SCHEMAS.LOGIN.safeParse({ method: 'EMAIL_LINK', name: value }).success,
      ).toBe(false);
      expect(EVENT_PROPS_SCHEMAS.CV_APPLIED.safeParse({ created: value, updated: 0 }).success).toBe(
        false,
      );
    }
  });
  it('Excel formül görünümlü bölüm adını formül değil metin hücresine yazar', async () => {
    const text = '=HYPERLINK("https://example.invalid","test")';
    const bytes = await buildUsageWorkbook(
      {
        from: new Date('2030-01-01'),
        to: new Date('2030-02-01'),
        minGroupSize: 3,
        totalsByType: [{ type: 'LOGIN', events: 3 }],
        activeUsers: 3,
        cells: [
          {
            kind: 'NAMED',
            type: 'LOGIN',
            role: 'STUDENT',
            departmentId: 'dept',
            departmentName: text,
            events: 3,
            users: 3,
          },
        ],
      },
      '1 bölüm',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    const cell = workbook.getWorksheet('Rol ve bölüm')!.getCell('C2');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe(text);
    expect(cell.formula).toBeUndefined();
  });
});
