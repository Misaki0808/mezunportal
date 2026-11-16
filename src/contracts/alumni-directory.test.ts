import { expect, it } from 'vitest';
import { alumniSearchSchema, alumniVisibilitySchema } from './alumni-directory';
it('aramayı ve yıl aralığını sınırlar, kapsam kimliğini kabul etmez', () => {
  expect(
    alumniSearchSchema.parse({ q: ' Ali ', graduationFrom: '2020', graduationTo: '2023' }),
  ).toMatchObject({ q: 'Ali', graduationFrom: 2020, graduationTo: 2023, page: 1 });
  for (const bad of [
    { q: 'a' },
    { graduationFrom: 2024, graduationTo: 2020 },
    { universityId: 'u' },
    { page: 0 },
  ])
    expect(alumniSearchSchema.safeParse(bad).success).toBe(false);
  expect(alumniVisibilitySchema.safeParse({ visible: true, userId: 'other' }).success).toBe(false);
});
