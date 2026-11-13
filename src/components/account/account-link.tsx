import Link from 'next/link';

import { IconChip, type IconChipTone, type UserIcon } from '@/components/ui';

type Props = {
  href: string;
  title: string;
  description: string;
  /** Kitin herhangi bir simgesi (hepsi aynı imzayı paylaşır). */
  icon: typeof UserIcon;
  tone?: IconChipTone;
};

/**
 * Hesap merkezindeki bağlantı satırı: simge + başlık + tek cümle açıklama + ok. Tek parça, tek dokunma hedefi (≥ 44 px).
 * Telefonda satırlar grubun tek çerçeveli listesinde bölücüyle dizilir (sayfadaki `listClasses`); geniş ekranda ayrı kart olur.
 */
export function AccountLink({ href, title, description, icon: Icon, tone = 'primary' }: Props) {
  return (
    <Link
      href={href}
      className="press-row flex min-h-[4.5rem] items-center gap-3 px-4 py-3 text-fg md:gap-4 md:rounded-card md:border md:border-border md:bg-bg"
    >
      <IconChip tone={tone}>
        <Icon />
      </IconChip>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="mt-0.5 block text-base text-fg-muted">{description}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-primary">
        ›
      </span>
    </Link>
  );
}
