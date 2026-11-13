import { getTranslations } from 'next-intl/server';
import { AccountLink } from '@/components/account/account-link';
import {
  ClipboardCheckIcon,
  DownloadIcon,
  ShieldIcon,
  TrashIcon,
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
            <AccountLink
              href={href}
              title={t(id)}
              description={t(`${id}Description`)}
              icon={Icon}
              tone={id === 'delete' ? 'accent' : 'success'}
            />
          </li>
        );
      })}
    </>
  );
}
