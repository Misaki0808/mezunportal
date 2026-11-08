import { useTranslations } from 'next-intl';

import type { CvSection } from '@/contracts/cv';

type Value = Record<string, unknown>;

/** `YYYY` ya da `YYYY-MM` → okunur tarih (yerel biçim). Geçersiz değer olduğu gibi gösterilir. */
export function formatYearMonth(value: string): string {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  if (!match[2]) return match[1]!;
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1),
  );
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Bir profil kalemini okunur satırlara döker (profil, CV onay ekranı ve düzeltme önizlemesi aynı görünümü
 * kullanır). Yalnız verilen alanları çizer; boş alan satır üretmez.
 */
export function EntrySummary({ section, value }: { section: CvSection; value: Value }) {
  const t = useTranslations('profile');
  const range = () => {
    const start = str(value.startDate);
    const end = value.isCurrent ? t('present') : str(value.endDate);
    if (!start && !end) return '';
    return t('dateRange', {
      start: start ? formatYearMonth(start) : '…',
      end: end && end !== t('present') ? formatYearMonth(end) : end || '…',
    });
  };
  const lines: { text: string; strong?: boolean; muted?: boolean }[] = [];
  if (section === 'EDUCATION') {
    lines.push({ text: str(value.institution), strong: true });
    const level = str(value.level);
    const detail = [
      level ? t(`educationLevels.${level as 'BACHELOR'}`) : '',
      str(value.fieldOfStudy),
    ]
      .filter(Boolean)
      .join(' · ');
    if (detail) lines.push({ text: detail });
    if (range()) lines.push({ text: range(), muted: true });
  } else if (section === 'POSITION') {
    lines.push({ text: str(value.title), strong: true });
    lines.push({ text: str(value.company) });
    const type = str(value.employmentType);
    if (type) lines.push({ text: t(`employmentTypes.${type as 'INTERNSHIP'}`) });
    if (range()) lines.push({ text: range(), muted: true });
    if (str(value.description)) lines.push({ text: str(value.description), muted: true });
  } else if (section === 'LANGUAGE') {
    const level = str(value.level);
    lines.push({
      text: [str(value.name), level ? `(${t(`languageLevels.${level as 'B2'}`)})` : '']
        .filter(Boolean)
        .join(' '),
      strong: true,
    });
  } else if (section === 'CERTIFICATION') {
    lines.push({ text: str(value.name), strong: true });
    if (str(value.issuer)) lines.push({ text: str(value.issuer) });
    if (str(value.issuedDate))
      lines.push({ text: formatYearMonth(str(value.issuedDate)), muted: true });
  } else {
    lines.push({ text: str(value.name), strong: true });
  }
  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line, index) => (
        <p
          key={index}
          className={
            line.strong
              ? 'break-words text-base font-semibold text-fg'
              : line.muted
                ? 'break-words whitespace-pre-line text-sm text-fg-muted'
                : 'break-words text-base text-fg'
          }
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
