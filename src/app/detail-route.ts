import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getAppointment, listSlots } from '@/server/actions/appointment';
import { getPublishedStory } from '@/server/actions/alumni-story';
import { getProfile } from '@/server/actions/profile-content';
import { getJobPosting } from '@/server/actions/job-postings';
import { getExperienceDetail } from '@/server/actions/experience';

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

type Group = 'appointment' | 'profile' | 'posting' | 'experience';
const routes = {
  appointment: [
    { pattern: /^\/randevular\/([^/]+)\/?$/, load: requestAppointmentDetail },
    { pattern: /^\/randevu-al\/([^/]+)\/?$/, load: requestMentorSlots },
  ],
  profile: [
    { pattern: /^\/hikayeler\/([^/]+)\/?$/, load: requestStoryDetail },
    { pattern: /^\/uye\/([^/]+)\/?$/, load: requestMemberProfile },
  ],
  posting: [{ pattern: /^\/ilanlar\/(?!yeni\/?$)([^/]+)\/?$/, load: requestPostingDetail }],
  experience: [{ pattern: /^\/deneyim\/(?!yeni\/?$)([^/]+)\/?$/, load: requestExperienceDetail }],
} satisfies Record<
  Group,
  { pattern: RegExp; load: (id: string) => Promise<{ ok: boolean; errorCode?: string }> }[]
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
      (result.errorCode === 'RESOURCE_NOT_FOUND' || result.errorCode === 'AUTH_FORBIDDEN')
    )
      notFound();
    return;
  }
}
