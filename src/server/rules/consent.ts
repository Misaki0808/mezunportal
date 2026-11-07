import {
  CONSENT_DOCUMENTS,
  CURRENT_CONSENT_VERSIONS,
  REQUIRED_CONSENT_DOCUMENTS,
  type ConsentDocument,
  type ConsentState,
} from '@/contracts/privacy';

export type ConsentDecisionRecord = {
  documentType: ConsentDocument;
  version: string;
  granted: boolean;
  createdAt: Date;
};

export type ConsentVersions = Readonly<Record<ConsentDocument, string>>;

const isRequired = (document: ConsentDocument) =>
  (REQUIRED_CONSENT_DOCUMENTS as readonly ConsentDocument[]).includes(document);

/**
 * Rıza durumu (saf). Bir belgenin geçerli kararı en son satırıdır. Zorunlu belge: son karar yoksa, geri
 * çekilmişse ya da sürümü güncel değilse `needsAction` ve `blocking`. İsteğe bağlı belge: yalnız onaylanmış
 * eski sürümde `needsAction` (yeni metni görmesi gerekir); hiç kilitlemez.
 */
export function computeConsentState(
  records: readonly ConsentDecisionRecord[],
  versions: ConsentVersions = CURRENT_CONSENT_VERSIONS,
): ConsentState {
  const documents = CONSENT_DOCUMENTS.map((documentType) => {
    const last = records
      .filter((record) => record.documentType === documentType)
      .reduce<ConsentDecisionRecord | null>(
        (latest, record) => (!latest || record.createdAt >= latest.createdAt ? record : latest),
        null,
      );
    const currentVersion = versions[documentType];
    const required = isRequired(documentType);
    const upToDate = last !== null && last.version === currentVersion;
    const needsAction = required
      ? !(upToDate && last.granted)
      : last !== null && last.granted && !upToDate;
    return {
      documentType,
      required,
      currentVersion,
      lastDecision: last
        ? { version: last.version, granted: last.granted, decidedAt: last.createdAt }
        : null,
      needsAction,
    };
  });
  return { documents, blocking: documents.some((doc) => doc.required && doc.needsAction) };
}

/** Kaydedilecek karar geçerli mi? Sürüm güncel değilse ya da zorunlu belge reddediliyorsa hata kodu. */
export function consentDecisionError(
  decision: { documentType: ConsentDocument; version: string; granted: boolean },
  versions: ConsentVersions = CURRENT_CONSENT_VERSIONS,
): 'CONSENT_VERSION_OUTDATED' | 'CONSENT_REQUIRED' | null {
  if (decision.version !== versions[decision.documentType]) return 'CONSENT_VERSION_OUTDATED';
  if (isRequired(decision.documentType) && !decision.granted) return 'CONSENT_REQUIRED';
  return null;
}
