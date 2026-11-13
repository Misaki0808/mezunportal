import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Kart 286: tarayıcının kendi çizdiği onay kutusu/radyo (gri, 13–20 px) kit `Checkbox`/`RadioGroup`/`Radio`'dan farklı görünür.
// Koyu temada ölçülemez (hesaplanmış stil `appearance: auto` der). Bu test kaynakta `type="checkbox|radio"` geri gelirse kırılır.
const SRC = path.resolve(process.cwd(), 'src');
/** Kit'in kendisi, bileşen galerisi ve KALAN bilinçli istisna: ilan formu/listesi W2'nin işinde (kart 281 EK); orada kit'e taşınınca kalkar. */
const EXCEPTIONS = ['components/ui/', 'app/ui-ornekleri/', 'components/job-postings/'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('yerli onay kutusu ve radyo düğmesi', () => {
  it('kit dışında hiçbir ekran type="checkbox" ya da type="radio" girdisi yazmaz', () => {
    const offenders = walk(SRC)
      .filter((file) => file.endsWith('.tsx') && !/\.test\./.test(file))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((file) => !EXCEPTIONS.some((prefix) => file.startsWith(prefix)))
      .filter((file) =>
        /type=\{?["'](?:checkbox|radio)["']/.test(readFileSync(path.join(SRC, file), 'utf8')),
      );

    expect(offenders, 'kit Checkbox/RadioGroup/Radio kullan').toEqual([]);
  });

  it('istisna listesi yalnız var olan dizinleri içerir (eskimiş istisna kalmaz)', () => {
    for (const prefix of EXCEPTIONS)
      expect(statSync(path.join(SRC, prefix)).isDirectory()).toBe(true);
  });
});
