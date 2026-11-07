import type { TestLoginInput } from '@/contracts/auth';

/** Test girişi kişilerinin seed e-postaları (`prisma/seed-data.ts` `TEST_PERSONAS`; eşitlik testle korunur). */
export const TEST_EMAIL_DOMAIN = 'test.mezunportal.local';

export const TEST_PERSONA_EMAILS: Record<TestLoginInput['persona'], string> = {
  student: `student@${TEST_EMAIL_DOMAIN}`,
  seniorMentor: `senior-mentor@${TEST_EMAIL_DOMAIN}`,
  alumniMentor: `alumni-mentor@${TEST_EMAIL_DOMAIN}`,
  academic: `academic@${TEST_EMAIL_DOMAIN}`,
  departmentAdmin: `department-admin@${TEST_EMAIL_DOMAIN}`,
  systemAdmin: `system-admin@${TEST_EMAIL_DOMAIN}`,
};
