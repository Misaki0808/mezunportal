import { useId } from 'react';

import { MARK, WORDMARK, type CapGeometry, type CapPart, type LetterTone } from './logo-geometry';

/**
 * mezunportal. logosu (kullanıcı kararı, 3. tur): küçük harf, kep "o" harfinde (yatık), "mezun" koyu → "portal" mor
 * ("n" ile "p" yapışık, renk geçişi), sondaki nokta mercan-pembe ve yuvarlak. Çizim harfler dış hatlı olduğu için yazı tipine
 * bağlı değildir. Renkler `--brand-*` token'larıdır (globals.css; koyu temada kendiliğinden döner). Küçük yerler için ayrı
 * sadeleştirilmiş simge: `BrandMark` (yalnız kepli "o").
 */

const LETTER_FILL: Record<Exclude<LetterTone, 'grad'>, string> = {
  ink: 'var(--brand-ink)',
  iris: 'var(--brand-iris)',
};

function Cap({
  cap,
  band = 0.88,
  board = 'var(--brand-cap)',
}: {
  cap: CapGeometry;
  band?: number;
  board?: string;
}) {
  const render = (part: CapPart, index: number) => {
    switch (part.kind) {
      case 'band':
        return <path key={index} d={part.d} fill={board} opacity={band} />;
      case 'board':
        return (
          <path
            key={index}
            d={part.d}
            fill={board}
            stroke={board}
            strokeWidth={part.sw}
            strokeLinejoin="round"
          />
        );
      case 'cord':
        return (
          <path
            key={index}
            d={part.d}
            fill="none"
            stroke="var(--brand-tassel)"
            strokeWidth={part.sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'weight':
        return (
          <rect
            key={index}
            x={part.x}
            y={part.y}
            width={part.w}
            height={part.h}
            rx={part.rx}
            fill="var(--brand-tassel)"
          />
        );
      case 'button':
        return (
          <circle key={index} cx={part.cx} cy={part.cy} r={part.r} fill="var(--brand-tassel)" />
        );
    }
  };
  return (
    <g transform={`rotate(${cap.angle} ${cap.pivot[0]} ${cap.pivot[1]})`}>
      {cap.parts.map(render)}
    </g>
  );
}

export function BrandLogo({ className, label }: { className?: string; label?: string }) {
  const gradientId = `brand-np-${useId().replace(/:/g, '')}`;
  const { gradient, dot, cap } = WORDMARK;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={WORDMARK.viewBox}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={gradient.x1}
          x2={gradient.x2}
          y1={0}
          y2={0}
        >
          <stop offset={0} style={{ stopColor: 'var(--brand-ink)' }} />
          <stop offset={1} style={{ stopColor: 'var(--brand-iris)' }} />
        </linearGradient>
      </defs>
      {WORDMARK.letters.map((letter, index) => (
        <path
          key={index}
          d={letter.d}
          fill={letter.tone === 'grad' ? `url(#${gradientId})` : LETTER_FILL[letter.tone]}
        />
      ))}
      <path d={WORDMARK.bridge} fill={`url(#${gradientId})`} />
      <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="var(--brand-dot)" />
      <Cap cap={cap} />
    </svg>
  );
}

/** Küçük yerler (üst çubuk köşesi, avatar, simge): iris zeminde beyaz "o" + lacivert kep + mercan püskül; sabit renk. */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect width={512} height={512} rx={112} fill="#5b5bf6" />
      <g transform={MARK.transform}>
        <path d={MARK.o} fill="#ffffff" />
        <Cap cap={MARK.cap} band={1} board="#14224a" />
      </g>
    </svg>
  );
}
