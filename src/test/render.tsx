import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach } from 'vitest';

import messages from '../../messages/tr.json';

// Vitest küresel `afterEach` sağlamadığı için RTL'nin otomatik temizliği burada elle bağlanır.
afterEach(cleanup);

function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
      {children}
    </NextIntlClientProvider>
  );
}

/** Bileşeni `tr` metin kataloğuyla çizer ve gerçek `userEvent` oturumu döner. */
export function renderUi(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(ui, { wrapper: Providers }) };
}
