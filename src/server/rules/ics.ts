/**
 * `.ics` (RFC 5545) üretimi (saf). Satır sonu CRLF, 75 oktette katlama, metin kaçışı. Katılımcı e-postası YAZILMAZ
 * (dosya yalnız iki katılımcıya iner; kişisel veri gerekmez). Zamanlar UTC (`Z`).
 */
const escapeText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/** 75 oktetten uzun satırı katlar; çok baytlı karakteri bölmez. */
export function foldLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out;
}

export function buildIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  now: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MezunPortal//Randevu//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@mezunportal`,
    `DTSTAMP:${stamp(input.now)}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.url ? [`URL:${input.url.replace(/[\r\n]/g, '')}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.flatMap(foldLine).join('\r\n') + '\r\n';
}
