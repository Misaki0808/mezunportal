import { createHash } from 'node:crypto';
import { istanbulDay } from './jobPosting';

/** Veriler çağıran tarafından yetki ve görünürlük denetiminden geçirilmiş olmalıdır. */
export type DigestInput = {
  experiences: readonly { id: string; label: string }[];
  jobs: readonly { id: string; title: string; organization: string }[];
  contribution: { earned: number; pending: number } | null;
  applicationWindows: readonly { label: string }[];
  // Etkinlik kaynağı P2-12'de bağlanacak.
  events: readonly { id: string; label: string }[];
};

/** Yalnız açıkça seçilen alanlar çıktıya alınır; deneyim yazarı hiç taşınmaz. */
export function selectDigest(input: DigestInput) {
  const experiences = input.experiences.map(({ id, label }) => ({ id, label }));
  const jobs = input.jobs.map(({ id, title, organization }) => ({ id, title, organization }));
  const contribution =
    input.contribution && (input.contribution.earned !== 0 || input.contribution.pending !== 0)
      ? { earned: input.contribution.earned, pending: input.contribution.pending }
      : null;
  const applicationWindows = input.applicationWindows.map(({ label }) => ({ label }));
  const events = input.events.map(({ id, label }) => ({ id, label }));
  if (
    !experiences.length &&
    !jobs.length &&
    !contribution &&
    !applicationWindows.length &&
    !events.length
  )
    return null;
  return {
    ...(experiences.length ? { experiences } : {}),
    ...(jobs.length ? { jobs } : {}),
    ...(contribution ? { contribution } : {}),
    ...(applicationWindows.length ? { applicationWindows } : {}),
    ...(events.length ? { events } : {}),
  };
}

export type Digest = NonNullable<ReturnType<typeof selectDigest>>;

/**
 * Aylık özetin VERİ parmak izi: gönderim anı bayatlık denetimi bunu karşılaştırır (işlenmiş metni DEĞİL). Yalnız özetin neyi
 * seçtiğini tutar: dönem, deneyim/ilan/etkinlik KİMLİKLERİ (küme: sıra önemsiz), başvuru dönemi etiketleri (firma/sektör
 * adı, veri) ve puanlar. Metin, adres, jeton, `APP_URL`, gizli anahtar ve `tr.json` etiketleri girmez; bu yüzden altbilgi,
 * şablon ya da ortam değişikliği kuyruktaki özeti düşürmez, veri değişince parmak izi değişir.
 */
export function digestFingerprint(digest: Digest, cycle: string): string {
  const sorted = (values: readonly string[] | undefined) => [...(values ?? [])].sort();
  const identity = {
    v: 1,
    cycle,
    experiences: sorted(digest.experiences?.map(({ id }) => id)),
    jobs: sorted(digest.jobs?.map(({ id }) => id)),
    events: sorted(digest.events?.map(({ id }) => id)),
    windows: sorted(digest.applicationWindows?.map(({ label }) => label)),
    contribution: digest.contribution
      ? [digest.contribution.earned, digest.contribution.pending]
      : null,
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('base64url');
}

/** İstanbul'da ayın ilk günü; yıl sınırında da yerel takvim kullanılır. */
export function monthlyDigestCycle(now: Date): string | null {
  const day = istanbulDay(now);
  return day.endsWith('-01') ? day.slice(0, 7) : null;
}
