'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const INTERVAL_MS = 5500;
const FADE_MS = 400;
const STORAGE_KEY = 'mezunportal:landing-motion-paused';
const CHANGE_EVENT = 'mezunportal-landing-motion-change';
let fallbackPaused = false;

function getPaused() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? fallbackPaused : value === 'true';
  } catch {
    return fallbackPaused;
  }
}
function subscribePaused(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}
function getReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function subscribeReduced(notify: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener?.('change', notify);
  return () => media.removeEventListener?.('change', notify);
}
const serverSnapshot = () => false;

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
  const paused = useSyncExternalStore(subscribePaused, getPaused, serverSnapshot);
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, serverSnapshot);

  useEffect(() => {
    if (paused || reduced || lines.length < 2) return;
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
  }, [paused, reduced, lines.length]);

  function toggle() {
    const next = !paused;
    fallbackPaused = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* Tercih oturumda korunur. */
    }
    setVisible(true);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return (
    <div className="landing-rotating-wrap">
      <p className="landing-rotating">
        <span className="sr-only">{lines[0]}</span>
        <span
          aria-hidden="true"
          className="landing-rotating-text"
          data-visible={visible || paused || reduced}
        >
          {lines[index]}
        </span>
      </p>
      {lines.length > 1 && (
        <button
          type="button"
          className="landing-motion-toggle"
          onClick={toggle}
          disabled={reduced}
          aria-label={reduced ? reducedLabel : paused ? resumeLabel : pauseLabel}
        >
          {reduced ? reducedLabel : paused ? resumeText : pauseText}
        </button>
      )}
    </div>
  );
}
