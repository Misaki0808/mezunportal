import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getAppointment, listSlots } from '@/server/actions/appointment';
import { getPublishedStory } from '@/server/actions/alumni-story';
import { getProfile } from '@/server/actions/profile-content';
import { getJobPosting, listMyJobPostings } from '@/server/actions/job-postings';
import { getExperienceDetail, getOwnAppliedMonth } from '@/server/actions/experience';
import { getFaqItem } from '@/server/actions/faq';
import { getCompany } from '@/server/actions/companies';

// İlkel kimlik argümanı: aynı render isteğinde layout ve sayfa aynı yetkili sonucu paylaşır.
export const requestAppointmentDetail = cache((id: string) =>
  getAppointment({ appointmentId: id }),
);
export const requestMentorSlots = cache((id: string) => listSlots({ mentorId: id }));
export const requestStoryDetail = cache((id: string) => getPublishedStory({ storyId: id }));
export const requestMemberProfile = cache((id: string) => getProfile({ userId: id }));
export const requestPostingDetail = cache((id: string) => getJobPosting({ id }));
export const requestExperienceDetail = cache((id: string) =>
  getExperienceDetail({ experienceId: id }),
);
export const requestOwnAppliedMonth = cache((id: string) =>
  getOwnAppliedMonth({ experienceId: id }),
);
export const requestFaqDetail = cache((id: string) => getFaqItem({ id }));
export const requestCompanyDetail = cache((slug: string) => getCompany({ slug }));

/** Düzenleme yalnız sahibin listesinden yüklenir; okuma yetkisi düzenleme yetkisi değildir. */
export const requestEditablePosting = cache(async (id: string) => {
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await listMyJobPostings({ cursor, limit: 50 });
    if (!page.ok) return page;
    const item = page.data.items.find((posting) => posting.id === id);
    if (item) return { ok: true, data: item } as const;
    cursor = page.data.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { ok: false, errorCode: 'RESOURCE_NOT_FOUND' } as const;
});

/** Her durumda okuma yetkisi düzenleme sahipliği vermez; sahibin kapalı durumu korunur. */
export const requestEditableExperience = cache(async (id: string) => {
  const ownership = await requestOwnAppliedMonth(id);
  if (!ownership.ok && ownership.errorCode !== 'EXPERIENCE_NOT_EDITABLE') return ownership;
  return requestExperienceDetail(id);
});

type Group = 'appointment' | 'profile' | 'posting' | 'experience' | 'faq';
const routes = {
  appointment: [
    { pattern: /^\/randevular\/([^/]+)\/?$/, load: requestAppointmentDetail },
    { pattern: /^\/randevu-al\/([^/]+)\/?$/, load: requestMentorSlots },
  ],
  profile: [
    { pattern: /^\/hikayeler\/([^/]+)\/?$/, load: requestStoryDetail },
    { pattern: /^\/uye\/([^/]+)\/?$/, load: requestMemberProfile },
  ],
  posting: [
    { pattern: /^\/ilanlar\/([^/]+)\/duzenle\/?$/, load: requestEditablePosting },
    { pattern: /^\/ilanlar\/(?!yeni\/?$)([^/]+)\/?$/, load: requestPostingDetail },
    { pattern: /^\/sirketler\/([^/]+)\/?$/, load: requestCompanyDetail, preserveForbidden: true },
  ],
  experience: [
    { pattern: /^\/deneyim\/([^/]+)\/duzenle\/?$/, load: requestEditableExperience },
    { pattern: /^\/deneyim\/(?!yeni\/?$)([^/]+)\/?$/, load: requestExperienceDetail },
  ],
  faq: [{ pattern: /^\/sss\/([^/]+)\/?$/, load: requestFaqDetail, preserveForbidden: true }],
} satisfies Record<
  Group,
  {
    pattern: RegExp;
    load: (id: string) => Promise<{ ok: boolean; errorCode?: string }>;
    preserveForbidden?: boolean;
  }[]
>;

/** Yalnız ilgili rota; sunucu eyleminin yetkili sonucu yok/gizliyse iskelet gönderilmeden 404. */
export async function rejectMissingDetail(group: Group) {
  const path = (await headers()).get(REQUEST_PATH_HEADER)?.split('?')[0] ?? '';
  for (const route of routes[group]) {
    const match = route.pattern.exec(path);
    if (!match) continue;
    let id: string;
    try {
      id = decodeURIComponent(match[1]!);
    } catch {
      notFound();
    }
    const result = await route.load(id).catch(() => null);
    if (
      result &&
      !result.ok &&
      (result.errorCode === 'RESOURCE_NOT_FOUND' ||
        (result.errorCode === 'AUTH_FORBIDDEN' &&
          !('preserveForbidden' in route && route.preserveForbidden)))
    )
      notFound();
    return;
  }
}
