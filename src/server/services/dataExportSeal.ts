import { DATA_EXPORT_UNREADABLE, dataExportSchema, type DataExport } from '@/contracts/privacy';

/**
 * Veri dökümünü sözleşmeye karşı TEK geçişte mühürler (kart 372, R1 362 P2-6 / 370 P3-1). Döküm KVKK m. 11 erişim hakkıdır: tek bozuk
 * değer bütün dökümü düşürmemeli, ama bozuk değer de sessizce yanlış görünmemeli.
 *  - Şemaya uymayan her alan (tip, aralık, eksik, birleşim) tam olarak `"UNREADABLE"` olur; komşu alanlar ve satırlar aynen kalır.
 *  - Sözleşmede olmayan anahtar (nesneler `strict`) çıktıdan ATILIR: yanlışlıkla eklenmiş bir alan (karşı tarafın kimliği, dosya
 *    anahtarı, jeton) kullanıcıya gitmez (hata kapalı yönde).
 * Dönüş yalnız sözleşme YOLLARINI taşır (`profile.completionScore`); değer, kimlik ya da ileti taşımaz (günlüğe bu gider).
 */
export type SealedExport = {
  data: DataExport;
  /** Şemaya uymadığı için `"UNREADABLE"` yapılan alan yolları. */
  unreadable: string[];
  /** Sözleşmede olmadığı için atılan anahtar yolları. */
  removed: string[];
};

type Container = Record<PropertyKey, unknown> | unknown[];

function pathText(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (text, key) =>
      typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key),
    '',
  );
}

function walk(root: unknown, path: readonly PropertyKey[]): Container | undefined {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node !== null && typeof node === 'object' ? (node as Container) : undefined;
}

export function sealDataExport(raw: unknown): SealedExport {
  const parsed = dataExportSchema.safeParse(raw);
  if (parsed.success) return { data: raw as DataExport, unreadable: [], removed: [] };
  const unreadable = new Set<string>();
  const removed = new Set<string>();
  // Zod her ihlali tek geçişte toplar; yolları işlemeden önce çıktıyı kopyala (çağıranın nesnesine dokunma).
  const copy: unknown = structuredClone(raw);
  for (const issue of parsed.error.issues) {
    const path = issue.path;
    if (issue.code === 'unrecognized_keys') {
      const parent = walk(copy, path);
      if (!parent || Array.isArray(parent)) continue;
      for (const key of issue.keys) {
        delete (parent as Record<string, unknown>)[key];
        removed.add(pathText([...path, key]));
      }
      continue;
    }
    // Kök hatası dökümün kimliğidir (sürüm vb.): mühürlenemez, çağıran 500 verir.
    if (path.length === 0) throw new Error('DATA_EXPORT_ROOT_INVALID');
    const parent = walk(copy, path.slice(0, -1));
    if (!parent) continue;
    (parent as Record<PropertyKey, unknown>)[path[path.length - 1]!] = DATA_EXPORT_UNREADABLE;
    unreadable.add(pathText(path));
  }
  return { data: copy as DataExport, unreadable: [...unreadable], removed: [...removed] };
}
