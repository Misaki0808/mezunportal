import { expect, it } from 'vitest';
import type { RedactedCvRequest } from './types';

type HasPdf = 'pdf' extends keyof RedactedCvRequest ? true : false;
it('gerçek sağlayıcıya ayrılan metin isteğinin tipinde PDF alanı yoktur', () => {
  const hasPdf: HasPdf = false;
  expect(hasPdf).toBe(false);
});

type HasOwnerName = 'ownerName' extends keyof RedactedCvRequest ? true : false;
it('gerçek sağlayıcı isteğinin tipinde sunucu sahibi adı da yoktur', () => {
  const hasOwnerName: HasOwnerName = false;
  expect(hasOwnerName).toBe(false);
});
