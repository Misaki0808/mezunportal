import { describe, expect, it } from 'vitest';
import { canEditExperience, canReadExperience } from './experience';

describe('deneyim erişim ve düzenleme kuralı', () => {
  it.each(['DRAFT', 'REJECTED'] as const)('%s yeniden düzenlenebilir', (status) =>
    expect(canEditExperience(status)).toBe(true),
  );
  it.each(['PENDING', 'PUBLISHED'] as const)(
    '%s yazarı tarafından yayını atlayarak değiştirilemez',
    (status) => expect(canEditExperience(status)).toBe(false),
  );
  it.each([
    {
      status: 'DRAFT' as const,
      isOwner: false,
      sameUniversity: true,
      canModerate: false,
      expected: false,
    },
    {
      status: 'PENDING' as const,
      isOwner: true,
      sameUniversity: false,
      canModerate: false,
      expected: true,
    },
    {
      status: 'REJECTED' as const,
      isOwner: false,
      sameUniversity: true,
      canModerate: false,
      expected: false,
    },
    {
      status: 'PUBLISHED' as const,
      isOwner: false,
      sameUniversity: true,
      canModerate: false,
      expected: true,
    },
    {
      status: 'PUBLISHED' as const,
      isOwner: false,
      sameUniversity: false,
      canModerate: false,
      expected: false,
    },
    {
      status: 'DRAFT' as const,
      isOwner: false,
      sameUniversity: false,
      canModerate: true,
      expected: true,
    },
  ])(
    'kapsam matrisi: $status / owner $isOwner / uni $sameUniversity / mod $canModerate',
    ({ expected, ...input }) => expect(canReadExperience(input)).toBe(expected),
  );
});
