import { describe, expect, it } from 'vitest';

import { computeConsentState, consentDecisionError, type ConsentDecisionRecord } from './consent';

const V1 = {
  PRIVACY_NOTICE: 'taslak-1',
  TERMS_OF_USE: 'taslak-1',
  CROSS_BORDER_TRANSFER: 'taslak-1',
  JOB_SEEKER_VISIBILITY: 'taslak-1',
} as const;
const V2 = { ...V1, PRIVACY_NOTICE: 'taslak-2' } as const;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 8, 0, minute));
const rec = (
  documentType: ConsentDecisionRecord['documentType'],
  version: string,
  granted: boolean,
  minute: number,
): ConsentDecisionRecord => ({ documentType, version, granted, createdAt: at(minute) });

const byDoc = (state: ReturnType<typeof computeConsentState>, doc: string) =>
  state.documents.find((d) => d.documentType === doc)!;

describe('computeConsentState', () => {
  it('hiç karar yok: zorunlular bekliyor, kilitli; isteğe bağlı beklemiyor', () => {
    const state = computeConsentState([], V1);
    expect(state.blocking).toBe(true);
    expect(byDoc(state, 'PRIVACY_NOTICE').needsAction).toBe(true);
    expect(byDoc(state, 'CROSS_BORDER_TRANSFER').needsAction).toBe(false);
  });

  it('iki zorunlu güncel sürümde onaylı: kilit yok', () => {
    const state = computeConsentState(
      [rec('PRIVACY_NOTICE', 'taslak-1', true, 1), rec('TERMS_OF_USE', 'taslak-1', true, 2)],
      V1,
    );
    expect(state.blocking).toBe(false);
  });

  it('metin sürümü değişince yeniden onaya yönlenir (kilit), yeni sürüm onaylanınca açılır', () => {
    const base = [
      rec('PRIVACY_NOTICE', 'taslak-1', true, 1),
      rec('TERMS_OF_USE', 'taslak-1', true, 2),
    ];
    const stale = computeConsentState(base, V2);
    expect(stale.blocking).toBe(true);
    expect(byDoc(stale, 'PRIVACY_NOTICE')).toMatchObject({
      needsAction: true,
      currentVersion: 'taslak-2',
    });
    expect(
      computeConsentState([...base, rec('PRIVACY_NOTICE', 'taslak-2', true, 3)], V2).blocking,
    ).toBe(false);
  });

  it('en son karar geçerlidir (sıra değil zaman)', () => {
    const state = computeConsentState(
      [
        rec('CROSS_BORDER_TRANSFER', 'taslak-1', false, 9),
        rec('CROSS_BORDER_TRANSFER', 'taslak-1', true, 5),
      ],
      V1,
    );
    expect(byDoc(state, 'CROSS_BORDER_TRANSFER').lastDecision?.granted).toBe(false);
  });

  it('isteğe bağlı rıza eski sürümde onaylıysa yeni metni görmeli; geri çekilmişse beklemez; hiç kilitlemez', () => {
    const v2x = { ...V1, CROSS_BORDER_TRANSFER: 'taslak-2' } as const;
    const ok = [
      rec('PRIVACY_NOTICE', 'taslak-1', true, 1),
      rec('TERMS_OF_USE', 'taslak-1', true, 1),
    ];
    const granted = computeConsentState(
      [...ok, rec('CROSS_BORDER_TRANSFER', 'taslak-1', true, 2)],
      v2x,
    );
    expect(byDoc(granted, 'CROSS_BORDER_TRANSFER').needsAction).toBe(true);
    expect(granted.blocking).toBe(false);
    const withdrawn = computeConsentState(
      [...ok, rec('CROSS_BORDER_TRANSFER', 'taslak-1', false, 2)],
      v2x,
    );
    expect(byDoc(withdrawn, 'CROSS_BORDER_TRANSFER').needsAction).toBe(false);
  });
});

describe('consentDecisionError', () => {
  it.each([
    [{ documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true }, null],
    [
      { documentType: 'PRIVACY_NOTICE', version: 'taslak-0', granted: true },
      'CONSENT_VERSION_OUTDATED',
    ],
    [{ documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: false }, 'CONSENT_REQUIRED'],
    [{ documentType: 'CROSS_BORDER_TRANSFER', version: 'taslak-1', granted: false }, null],
  ] as const)('%j → %s', (decision, expected) => {
    expect(consentDecisionError(decision, V1)).toBe(expected);
  });
});
