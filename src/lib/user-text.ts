import { z } from 'zod';

/** Kullanıcı metninde sınır; saklanan metinle aynı NFC biçimi ve Unicode kod noktaları üzerinden ölçülür. */
export const normalizeUserText = (value: string) => value.trim().normalize('NFC');
export const userTextLength = (value: string) => Array.from(normalizeUserText(value)).length;

/** İstemci ve sunucu aynı şemayı kullanır: kırp, NFC'ye dönüştür, ardından sınırları denetle. */
export function userTextSchema(min: number, max: number, error = 'VALIDATION_INVALID') {
  return z.string({ error }).trim().normalize('NFC').min(min, { error }).max(max, { error });
}
