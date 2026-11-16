import Link from 'next/link';

import { ChevronRightIcon, IconChip, type IconChipTone, type UserIcon } from '@/components/ui';

type Props = {
  href: string;
  title: string;
  description: string;
  /** Kitin herhangi bir simgesi (hepsi aynı imzayı paylaşır). */
  icon: typeof UserIcon;
  tone?: IconChipTone;
};

/**
 * Hesap merkezindeki bağlantı satırı: simge + başlık + tek cümle açıklama + ok. Tek parça, tek dokunma hedefi (≥ 56 px).
 * Satırlar grubun tek kartında ince çizgiyle ayrılır (sayfadaki `listClasses`); her satır ayrı kutu değildir (görünüm A kart dili).
 */
export function AccountLink({ href, title, description, icon: Icon, tone = 'primary' }: Props) {
  return (
    <Link
      href={href}
      className="press-row flex min-h-14 items-center gap-3.5 px-4 py-3 text-fg hover:bg-surface-strong"
    >
      <IconChip tone={tone} className="size-10">
        <Icon />
      </IconChip>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug text-fg-muted">
          {description}
        </span>
      </span>
      <ChevronRightIcon aria-hidden="true" className="shrink-0 text-fg-subtle" />
    </Link>
  );
}
