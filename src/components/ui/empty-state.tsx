import type { ReactNode } from 'react';

import { cn } from './cn';
import { InboxIcon } from './icons';

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Tek net eylem (örn. bir `Button`). */
  action?: ReactNode;
  className?: string;
};

/** “Boş” durumu: sebep + sonraki adım. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="text-fg-subtle">
        {icon ?? <InboxIcon width={40} height={40} strokeWidth={1.5} />}
      </span>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {description && <p className="max-w-prose text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
