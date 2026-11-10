'use client';

import { useEffect, useState } from 'react';

const INTERVAL_MS = 5500;
const FADE_MS = 400;
const STORAGE_KEY = 'mezunportal:landing-motion-paused';

export function RotatingLine({
  lines,
  pauseText,
  resumeText,
  pauseLabel,
  resumeLabel,
  reducedLabel,
}: {
  lines: readonly string[];
  pauseText: string;
  resumeText: string;
  pauseLabel: string;
  resumeLabel: string;
  reducedLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    try {
      setPaused(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      /* Storage engelliyse oturumda çalışır. */
    }
    setReady(true);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!ready || paused || reduced || lines.length < 2) {
      setVisible(true);
      return;
    }
    let fade: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false);
      fade = setTimeout(() => {
        setIndex((current) => (current + 1) % lines.length);
        setVisible(true);
      }, FADE_MS);
    }, INTERVAL_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(fade);
    };
  }, [ready, paused, reduced, lines.length]);

  function toggle() {
    const next = !paused;
    setPaused(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* Storage engelliyse oturumda çalışır. */
    }
  }

  return (
    <div className="landing-rotating-wrap">
      <p className="landing-rotating">
        <span className="sr-only">{lines[0]}</span>
        <span aria-hidden="true" className="landing-rotating-text" data-visible={visible}>
          {lines[index]}
        </span>
      </p>
      {lines.length > 1 && (
        <button
          type="button"
          className="landing-motion-toggle"
          onClick={toggle}
          disabled={!ready || reduced}
          aria-label={reduced ? reducedLabel : paused ? resumeLabel : pauseLabel}
        >
          {reduced ? reducedLabel : paused ? resumeText : pauseText}
        </button>
      )}
    </div>
  );
}
