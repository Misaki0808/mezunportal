// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { UsageMetrics } from '@/contracts/metrics';
vi.mock('@/server/actions/metrics', () => ({ getUsageMetrics: vi.fn() }));
import { MetricsPanel } from './metrics-panel';

const filter = { from: new Date('2031-03-01T00:00:00Z'), to: new Date('2031-04-01T00:00:00Z') };
const hidden: UsageMetrics = {
  ...filter,
  minGroupSize: 3,
  activeUsers: null,
  totalsByType: [{ type: 'LOGIN', events: null }],
  cells: [],
};
describe('kullanım paneli', () => {
  it('gizli toplam ve etkin kullanıcıya sayı veya grafik atamaz', () => {
    renderUi(<MetricsPanel initial={hidden} initialFilter={filter} departments={[]} />);
    expect(screen.getAllByText('Gizli (3’ten az kişi)').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    const totals = screen.getByRole('heading', { name: 'Olay türleri' }).closest('section')!;
    expect(within(totals).getByText('Gizli (3’ten az kişi)')).toBeInTheDocument();
    expect(within(totals).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });
  it('Excel 429 olduğunda tekrar indirme kilitlenir ve sebep görünür', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 429, ok: false }));
    const { user } = renderUi(
      <MetricsPanel initial={hidden} initialFilter={filter} departments={[]} />,
    );
    await user.click(screen.getByRole('button', { name: 'Excel indir' }));
    expect(
      await screen.findByText('Saatlik indirme sınırına ulaştın. Bir saat sonra tekrar dene.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excel indir' })).toBeDisabled();
    vi.unstubAllGlobals();
  });
  it('sıfır dönem yeni tarih seçmeye yönlendirir', () => {
    renderUi(
      <MetricsPanel
        initial={{ ...hidden, totalsByType: [{ type: 'LOGIN', events: 0 }] }}
        initialFilter={filter}
        departments={[]}
      />,
    );
    expect(screen.getByText('Bu dönemde gösterilecek etkinlik yok')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tarihleri değiştir' })).toBeVisible();
  });
});
