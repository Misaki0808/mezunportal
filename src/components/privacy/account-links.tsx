import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  ClipboardCheckIcon,
  DownloadIcon,
  ShieldIcon,
  TrashIcon,
  IconChip,
  UsersIcon,
} from '@/components/ui';

export async function PrivacyAccountLinks() {
  const t = await getTranslations('privacyScreens.account');
  const links = [
    ['consent', '/onay'],
    ['visibility', '/hesap/gizlilik'],
    ['contacts', '/hesap/iletisim'],
    ['export', '/hesap/veriler'],
    ['delete', '/hesap/hesabi-sil'],
  ] as const;
  const icons = {
    consent: ClipboardCheckIcon,
    visibility: ShieldIcon,
    contacts: UsersIcon,
    export: DownloadIcon,
    delete: TrashIcon,
  };
  return (
    <>
      {links.map(([id, href]) => {
        const Icon = icons[id];
        return (
          <li key={id}>
            <Link
              href={href}
              className="press-row flex min-h-20 items-center gap-4 rounded-card border border-border bg-bg p-4 text-fg"
            >
              <IconChip tone={id === 'delete' ? 'accent' : 'success'}>
                <Icon />
              </IconChip>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{t(id)}</span>
                <span className="mt-1 block text-base text-fg-muted">{t(`${id}Description`)}</span>
              </span>
              <span aria-hidden="true" className="text-xl text-primary">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </>
  );
}
