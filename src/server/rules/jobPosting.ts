import {
  JOB_POSTING_AUTHOR_ROLES,
  JOB_POSTING_MAX_DAYS,
  JOB_POSTING_POINTS_PER_MONTH,
  type JobPostingAuthorRole,
  type JobPostingStatus,
} from '@/contracts/job-postings';

import { monthKey } from './appointmentSlots';
import { computeClassStanding } from './classYear';

/**
 * İlan kuralları (saf; docs/faz2-plan.md P2-04, D19). Veritabanı, saat ve rastgelelik yok: hepsi tablo-güdümlü testlidir.
 * Takvim günü `YYYY-MM-DD` (İstanbul; UTC+3 sabit, yaz saati yok) metnidir; son başvuru günü o günün SONUNA kadar (dahil) açıktır.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Anın İstanbul takvim günü (`YYYY-MM-DD`). */
export function istanbulDay(date: Date): string {
  return new Date(date.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` gününe `days` gün ekler (negatif olabilir). */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `to − from` gün farkı (tam gün; her ikisi `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Veritabanı `DATE` değeri (UTC gece yarısı) → `YYYY-MM-DD`. */
export function dayOfDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Son başvuru günü sorunu: `PAST` (bugünden önce), `TOO_FAR` (`baseDay`'den `JOB_POSTING_MAX_DAYS` günden uzak), yoksa `null`.
 * Gönderimde `baseDay = bugün`; yayında `baseDay = yayın günü` (moderatör süreyi uzatamaz; bekleme sırasında geçen gün payı yer).
 */
export function deadlineProblem(
  deadlineOn: string,
  today: string,
  baseDay: string = today,
): 'PAST' | 'TOO_FAR' | null {
  if (deadlineOn < today) return 'PAST';
  if (daysBetween(baseDay, deadlineOn) > JOB_POSTING_MAX_DAYS) return 'TOO_FAR';
  return null;
}

/** Bugünden son güne kalan gün (bugün son gün = 0); süresi geçmişse 0'a kırpılmaz, negatif döner (çağıran açıklığı `isOpen` ile bilir). */
export function daysLeft(deadlineOn: string, today: string): number {
  return daysBetween(today, deadlineOn);
}

/** İlan okuyucuya açık mı: yayında ve son gün bugün ya da sonrası. */
export function isOpen(
  input: { status: JobPostingStatus; deadlineOn: string | null },
  today: string,
): boolean {
  return input.status === 'PUBLISHED' && input.deadlineOn !== null && input.deadlineOn >= today;
}

/** Öğrencinin ilan paylaşabilmesi için etkin sınıfı en az bu olmalı (hoca önerisi + kullanıcı kararı, 28 Kas; uzatmadakiler dahil). */
export const STUDENT_POSTING_MIN_GRADE = 4;

/** Yazarlığı belirleyen üyelik bilgisi (aktörün gerçekleri; yüklenen satırlar). Öğrenci sınıfı `entryYear` + `classOffset`'ten hesaplanır. */
export type AuthorMembershipFact = {
  role: string;
  departmentId: string;
  verificationStatus: string;
  endedAt: Date | null;
  entryYear: number | null;
  classOffset: number;
};

const AUTHOR_ROLE_PRIORITY: readonly JobPostingAuthorRole[] = ['ACADEMIC', 'ALUMNI', 'STUDENT'];

/** Öğrencinin etkin sınıfı ilan paylaşmaya yeter mi: 4. sınıf ve üstü (uzatmadakiler dahil); hazırlık, başlamamış ve bilinmeyen yetmez. */
export function meetsStudentPostingGrade(
  member: Pick<AuthorMembershipFact, 'entryYear' | 'classOffset'>,
  now: Date,
): boolean {
  const standing = computeClassStanding(
    { entryYear: member.entryYear, classOffset: member.classOffset },
    now,
  );
  return standing.kind === 'GRADE' && standing.grade >= STUDENT_POSTING_MIN_GRADE;
}

/** Bu bölümde doğrulanmış, etkin ve yazar rolü olan üyelikler (sınıf şartı ayrıca bakılır). */
function authorMemberships(
  memberships: readonly AuthorMembershipFact[],
  departmentId: string,
): AuthorMembershipFact[] {
  return memberships.filter(
    (m) =>
      m.departmentId === departmentId &&
      m.endedAt === null &&
      m.verificationStatus === 'VERIFIED' &&
      (JOB_POSTING_AUTHOR_ROLES as readonly string[]).includes(m.role),
  );
}

/**
 * Yazarın BU bölümdeki ilan rolü: o bölümde doğrulanmış, etkin üyelik; öğrenci üyelik yalnız sınıfı 4 ve üstüyse sayılır.
 * Aynı bölümde birden çok rol varsa mezun/akademisyen öğrenciyi geçer (öğrenci sınıfı bakılmaz). Yoksa `null` (yetkisiz).
 * Moderasyon kapsamı ilanın yazıldığı bölümdür; kural da o bölüme göredir.
 */
export function postingAuthorRole(
  memberships: readonly AuthorMembershipFact[],
  departmentId: string,
  now: Date,
): JobPostingAuthorRole | null {
  const roles = authorMemberships(memberships, departmentId)
    .filter((m) => m.role !== 'STUDENT' || meetsStudentPostingGrade(m, now))
    .map((m) => m.role as JobPostingAuthorRole);
  return AUTHOR_ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

/**
 * Bu bölümde ilan yazmayı YALNIZ sınıf yetmediği için kaybeden öğrenci mi: doğrulanmış etkin öğrenci üyeliği var ama sınıfı
 * 4'ün altında (hazırlık ve bilinmeyen dahil) ve aynı bölümde mezun/akademisyen üyeliği yok. Hata kodunu ayırmak içindir.
 */
export function isStudentBelowPostingGrade(
  memberships: readonly AuthorMembershipFact[],
  departmentId: string,
  now: Date,
): boolean {
  return (
    postingAuthorRole(memberships, departmentId, now) === null &&
    authorMemberships(memberships, departmentId).some((m) => m.role === 'STUDENT')
  );
}

/** Yazar herhangi bir bölümde ilan yazabilir mi (ekranda “İlan paylaş” ve “İlanlarım” için; asıl yetki sunucuda denetlenir). */
export function canPostAnywhere(memberships: readonly AuthorMembershipFact[], now: Date): boolean {
  return [...new Set(memberships.map((m) => m.departmentId))].some(
    (departmentId) => postingAuthorRole(memberships, departmentId, now) !== null,
  );
}

/**
 * Yazar bu bölümde yalnız öğrenci mi: yalnız `URL` (başka yerde görülen ilanın https bağlantısı) yöntemiyle ilan paylaşabilir,
 * `CONTACT_REQUEST` (mezunun kendi adına iletişim talebi) mezun/akademisyene özgüdür.
 */
export function isUrlOnlyAuthor(
  memberships: readonly AuthorMembershipFact[],
  departmentId: string,
  now: Date,
): boolean {
  return postingAuthorRole(memberships, departmentId, now) === 'STUDENT';
}

/** Yazar yalnız taslağı ve reddedilmiş ilanı düzenler. */
export function canEditPosting(status: JobPostingStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/** Yazar yalnız incelemedeki ya da yayındaki ilanı çeker. */
export function canClosePosting(status: JobPostingStatus): boolean {
  return status === 'PENDING' || status === 'PUBLISHED';
}

/**
 * İlan puanı çarpanı (yüzde): yazarın aynı İstanbul takvim ayında bu ilan DIŞINDA, geri alınmamış ve çarpanı > 0 olan ilan puanı
 * sayısı `JOB_POSTING_POINTS_PER_MONTH`'a ulaştıysa 0, değilse 100. `scoredEventAts`: o kayıtların olay (yayın) anları.
 */
export function jobPostingMultiplierPercent(
  eventAt: Date,
  scoredEventAts: readonly Date[],
): number {
  const month = monthKey(eventAt);
  const inMonth = scoredEventAts.filter((at) => monthKey(at) === month).length;
  return inMonth >= JOB_POSTING_POINTS_PER_MONTH ? 0 : 100;
}
