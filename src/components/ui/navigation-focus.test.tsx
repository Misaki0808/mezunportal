// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithToasts } from '@/test/render';
import { Button } from '@/components/ui';
import { useAction } from '@/components/ui/use-action';
it('gönderim sayfa bileşenini kaldırıp iskelet gösterince yeni sayfanın h1 odağı korunur', async () => {
  function Sender({ sent }: { sent: () => void }) {
    const a = useAction();
    return (
      <Button
        loading={a.busy}
        onClick={() => void a.run(async () => ({ ok: true, data: null }), { onOk: sent })}
      >
        İncelemeye gönder
      </Button>
    );
  }
  function Route() {
    const [route, setRoute] = useState('form');
    useEffect(() => {
      if (route !== 'loading') return;
      const timer = setTimeout(() => setRoute('done'), 250);
      return () => clearTimeout(timer);
    }, [route]);
    return route === 'form' ? (
      <main>
        <h1>İlan oluştur</h1>
        <Sender sent={() => setRoute('loading')} />
      </main>
    ) : route === 'loading' ? (
      <main>
        <p>Yükleniyor</p>
      </main>
    ) : (
      <main>
        <h1>İlanlarım</h1>
      </main>
    );
  }
  const { user } = renderWithToasts(<Route />);
  await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'İlanlarım' })).toHaveFocus(), {
    timeout: 1200,
  });
});
