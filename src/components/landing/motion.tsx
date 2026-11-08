'use client';

import { useEffect, useRef, useState } from 'react';

/** İlk HTML nihai değeri taşır; azaltılmış harekette ve JS kapalıyken de içerik eksilmez. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / 900, 1);
          setShown(Math.round(value * (1 - (1 - progress) ** 3)));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <span ref={ref} className="landing-count">
      <span aria-hidden="true" className="landing-count-placeholder">
        {new Intl.NumberFormat('tr-TR').format(value)}
      </span>
      <span aria-hidden="true" className="landing-count-animated">
        {new Intl.NumberFormat('tr-TR').format(shown)}
      </span>
      <span className="sr-only">{new Intl.NumberFormat('tr-TR').format(value)}</span>
    </span>
  );
}

/** İçerik varsayılan olarak görünür; gözlem yalnız hafif hareket ekler. */
export function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.classList.add('landing-revealed');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="landing-reveal">
      {children}
    </div>
  );
}
