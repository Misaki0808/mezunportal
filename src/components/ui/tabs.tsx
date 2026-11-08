'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { cn } from './cn';

export type TabItem = { id: string; label: string; content: ReactNode };

export type TabsProps = {
  items: readonly TabItem[];
  /** Sekme listesinin erişilebilir adı (ZORUNLU). */
  label: string;
  defaultId?: string;
  value?: string;
  onValueChange?: (id: string) => void;
  className?: string;
};

/**
 * WAI-ARIA sekmeler: ok tuşları (←/→, Home/End) sekmeler arasında gezinir ve seçer; yalnız seçili
 * sekme sekme sırasındadır (roving tabindex), içerik paneli sekmeyle etiketlidir.
 */
export function Tabs({ items, label, defaultId, value, onValueChange, className }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultId ?? items[0]?.id);
  const selectedId = value ?? internal;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const revealSelected = useCallback(() => {
    if (selectedId === undefined) return;
    tabRefs.current.get(selectedId)?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selectedId]);
  // Şerit sığmayınca kaydırma ipucu: hangi kenarda gizli sekme var?
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const start = list.scrollLeft > 1;
    const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setEdges((old) => (old.start === start && old.end === end ? old : { start, end }));
  }, []);
  useEffect(() => {
    revealSelected();
    measure();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      revealSelected();
      measure();
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure, items.length, revealSelected]);

  function select(id: string) {
    if (value === undefined) setInternal(id);
    onValueChange?.(id);
    tabRefs.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === selectedId);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (target) select(target.id);
  }

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          onScroll={measure}
          className="flex gap-1 overflow-x-auto border-b border-border"
        >
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(item.id, node);
                  else tabRefs.current.delete(item.id);
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.id)}
                className={cn(
                  'press-control -mb-px min-h-11 shrink-0 border-b-2 px-4 text-base font-medium whitespace-nowrap',
                  selected
                    ? 'border-primary text-primary'
                    : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {edges.start && (
          <span
            aria-hidden="true"
            data-tabs-fade="start"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-[linear-gradient(to_right,var(--color-bg),transparent)]"
          />
        )}
        {edges.end && (
          <span
            aria-hidden="true"
            data-tabs-fade="end"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(to_left,var(--color-bg),transparent)]"
          />
        )}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selectedId}
          tabIndex={0}
          className="pt-4"
        >
          {item.id === selectedId ? item.content : null}
        </div>
      ))}
    </div>
  );
}
