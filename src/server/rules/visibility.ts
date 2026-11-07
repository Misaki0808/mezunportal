import type { ContactField, VisibilityLevel } from '@/contracts/privacy';
import { NotImplementedError } from '@/lib/not-implemented';

/**
 * Kişisel alan görünürlüğü — TEK KURAL YERİ (P1-03; docs/security.md “KVKK”). Profil, dizin, iletişim
 * talebi ve veri dökümü bu kurala sorar; ekran ve servis kuralı kopyalamaz. Saf işlevdir: veritabanı
 * okumaz, girdisini çağıran hazırlar. SÖZLEŞME PR'I: imza + karar tablosu; gövde servis kartında.
 */

/**
 * Bakan kişinin alan sahibine göre konumu (çağıran oturumdan ve üyelikten hesaplar):
 *  - `OWNER`: alanın sahibi.
 *  - `ADMIN_TASK`: kapsayan yönetici, YALNIZ görev ekranında (doğrulama kuyruğu, şikâyet) bakıyor.
 *  - `APPROVED_REQUESTER`: bu alanı da içeren, durumu `APPROVED` bir iletişim talebinin sahibi.
 *  - `VERIFIED_MEMBER`: doğrulanmış etkin üyeliği olan başka kullanıcı.
 *  - `OTHER`: doğrulanmamış, askıdaki ya da oturumsuz.
 */
export const VIEWER_RELATIONS = [
  'OWNER',
  'ADMIN_TASK',
  'APPROVED_REQUESTER',
  'VERIFIED_MEMBER',
  'OTHER',
] as const;
export type ViewerRelation = (typeof VIEWER_RELATIONS)[number];

/** `FULL`: değer olduğu gibi · `MASKED`: maskeli (`a***@o***.edu.tr`, `+90 5** *** ** 12`) · `NONE`: yanıtta YOK. */
export type FieldAccess = 'FULL' | 'MASKED' | 'NONE';
/** Tanınmayan seviye/ilişki veya tablo eşleşmesi yoksa alan yanıta girmez. */
export const DEFAULT_FIELD_ACCESS = 'NONE' satisfies FieldAccess;

export type VisibilityInput = {
  field: ContactField;
  /** Sahibin seçtiği ya da varsayılan seviye (`DEFAULT_FIELD_VISIBILITY`). */
  level: VisibilityLevel;
  relation: ViewerRelation;
};

export type VisibilityDecisionRow = {
  level: VisibilityLevel;
  relation: ViewerRelation;
  access: FieldAccess;
};

/**
 * Karar tablosu (docs/security.md seviyelerinin birebir karşılığı; servis testleri bu tabloya karşı
 * yazılır). Kural: sahibi hep tam görür; yönetici görev ekranında hep maskeli görür (tam değil);
 * `ON_APPROVED_REQUEST` yalnız onaylı talep sahibine tam; `MEMBERS` doğrulanmış üyelere ve onaylı
 * talep sahibine tam; diğer her durumda alan yanıtta yoktur.
 *
 * Not: `APPROVED_REQUESTER` yalnız talepte İSTENEN alan için geçerlidir; istenmeyen alanda çağıran
 * ilişkiyi `VERIFIED_MEMBER` (ya da `OTHER`) olarak verir.
 */
export const VISIBILITY_DECISION_TABLE: readonly VisibilityDecisionRow[] = [
  { level: 'PRIVATE', relation: 'OWNER', access: 'FULL' },
  { level: 'PRIVATE', relation: 'ADMIN_TASK', access: 'MASKED' },
  { level: 'PRIVATE', relation: 'APPROVED_REQUESTER', access: 'NONE' },
  { level: 'PRIVATE', relation: 'VERIFIED_MEMBER', access: 'NONE' },
  { level: 'PRIVATE', relation: 'OTHER', access: 'NONE' },

  { level: 'ON_APPROVED_REQUEST', relation: 'OWNER', access: 'FULL' },
  { level: 'ON_APPROVED_REQUEST', relation: 'ADMIN_TASK', access: 'MASKED' },
  { level: 'ON_APPROVED_REQUEST', relation: 'APPROVED_REQUESTER', access: 'FULL' },
  { level: 'ON_APPROVED_REQUEST', relation: 'VERIFIED_MEMBER', access: 'NONE' },
  { level: 'ON_APPROVED_REQUEST', relation: 'OTHER', access: 'NONE' },

  { level: 'MEMBERS', relation: 'OWNER', access: 'FULL' },
  { level: 'MEMBERS', relation: 'ADMIN_TASK', access: 'MASKED' },
  { level: 'MEMBERS', relation: 'APPROVED_REQUESTER', access: 'FULL' },
  { level: 'MEMBERS', relation: 'VERIFIED_MEMBER', access: 'FULL' },
  { level: 'MEMBERS', relation: 'OTHER', access: 'NONE' },
];

/** Alan bu bakana nasıl gösterilir? Gövde servis kartında; `VISIBILITY_DECISION_TABLE`'a uyar. */
export function fieldAccess(input: VisibilityInput): FieldAccess {
  void input;
  throw new NotImplementedError('rules/visibility.fieldAccess');
}
