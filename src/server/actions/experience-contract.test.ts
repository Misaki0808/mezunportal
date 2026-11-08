import { describe, expect, it } from 'vitest';
import {
  getExperienceDetail,
  listExperienceReports,
  listModerationQueue,
  listMyExperiences,
  reportExperience,
  resolveExperienceReport,
  reviewExperience,
  saveExperienceDraft,
  submitExperience,
} from './experience';

describe('deneyim sözleşmesi eylemleri oturumsuz kapalıdır', () => {
  it.each([
    [
      'saveExperienceDraft',
      () =>
        saveExperienceDraft({
          departmentId: 'd',
          content: { type: 'INTERNSHIP' },
          isAnonymous: true,
        }),
    ],
    ['submitExperience', () => submitExperience({ experienceId: 'x' })],
    ['reviewExperience', () => reviewExperience({ experienceId: 'x', decision: 'PUBLISH' })],
    ['reportExperience', () => reportExperience({ experienceId: 'x', reason: 'Gerekçe' })],
    ['listMyExperiences', () => listMyExperiences({})],
    ['getExperienceDetail', () => getExperienceDetail({ experienceId: 'x' })],
    ['listModerationQueue', () => listModerationQueue({})],
    ['listExperienceReports', () => listExperienceReports({})],
    [
      'resolveExperienceReport',
      () => resolveExperienceReport({ reportId: 'r', decision: 'DISMISSED', reason: 'Gerekçe' }),
    ],
  ] as const)('%s → AUTH_UNAUTHENTICATED', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
  });
});
