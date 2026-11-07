import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/tr.json';
import { CONSENT_DOCUMENTS, type ConsentState } from '@/contracts/privacy';
import { ToastProvider } from '@/components/ui';
import { ConsentForm } from './consent-form';
import { DeleteForm } from './delete-form';
import { ContactList } from './contact-list';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/server/actions/privacy', () => ({ recordConsents: vi.fn(), deleteAccount: vi.fn() }));
vi.mock('@/server/actions/contact-request', () => ({
  listContactRequests: vi.fn(),
  respondToContactRequest: vi.fn(),
  revokeContactRequest: vi.fn(),
  withdrawContactRequest: vi.fn(),
}));
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
      <ToastProvider>{node}</ToastProvider>
    </NextIntlClientProvider>,
  );
const state: ConsentState = {
  blocking: true,
  documents: CONSENT_DOCUMENTS.map((documentType) => ({
    documentType,
    currentVersion: 'taslak-1',
    required: documentType !== 'CROSS_BORDER_TRANSFER',
    lastDecision: null,
    needsAction: true,
  })),
};
describe('KVKK ekran sınırları', () => {
  it('ilk kayıtta hiçbir onayı önceden seçmez; isteğe bağlı aktarımı ayrı gösterir', () => {
    const html = render(<ConsentForm state={state} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toContain('İsteğe bağlı');
    expect(html).toContain('Hoca / hukuk onayı');
    expect(html).toContain('/hukuki/aydinlatma');
    expect(html).toContain('/hukuki/yurt-disi-aktarim');
  });
  it('eski sürüm onayını yeni sürümde seçili göstermez', () => {
    const old = {
      ...state,
      documents: state.documents.map((d) => ({
        ...d,
        lastDecision: { version: 'taslak-0', granted: true, decidedAt: new Date() },
      })),
    };
    expect(render(<ConsentForm state={old} />)).not.toMatch(/checked=""/);
  });
  it('K-09 sil varsayılanı seçili, anonimleştirme seçilmemiş; kalıcı işlem açıklaması görünür', () => {
    const html = render(<DeleteForm />);
    expect(html).toMatch(/checked=""[^>]*value="DELETE"|value="DELETE"[^>]*checked=""/);
    expect(html).not.toMatch(/value="ANONYMIZE"[^>]*checked=""/);
    expect(html).toContain('Bütün oturumların kapanır.');
    expect(html).toContain('Onaylamak için e-posta');
  });
  it('geri alınmış talepte dönen kişisel alan yoksa ekranda da yok; durum açıkça görünür', () => {
    const html = render(
      <ContactList
        initialBox="OUTGOING"
        initial={{
          nextCursor: null,
          items: [
            {
              id: 'request',
              counterpart: { userId: 'member', name: 'Örnek Üye' },
              fields: ['EMAIL'],
              message: null,
              status: 'REVOKED',
              createdAt: new Date('2026-11-08T12:00:00Z'),
              decidedAt: new Date(),
              closedAt: new Date(),
              revealed: null,
            },
          ],
        }}
      />,
    );
    expect(html).toContain('Onay geri alındı');
    expect(html).not.toContain('Seninle paylaşılan bilgiler');
  });
});
