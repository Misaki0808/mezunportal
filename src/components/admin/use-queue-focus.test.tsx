// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { useQueueFocus } from './use-queue-focus';
function Queue({
  ids = ['first', 'second'],
  delayed = false,
}: {
  ids?: string[];
  delayed?: boolean;
}) {
  const [rows, setRows] = useState(ids);
  const { rootRef, complete } = useQueueFocus();
  return (
    <div ref={rootRef}>
      <h1>Kuyruk</h1>
      {rows.map((id) => (
        <div data-queue-row={id} key={id}>
          <button
            data-queue-action
            onClick={() => {
              complete(id);
              if (!delayed) setRows(rows.filter((x) => x !== id));
            }}
          >
            {id}
          </button>
        </div>
      ))}
      {delayed && <button onClick={() => setRows(rows.slice(1))}>Yenileme tamamlandı</button>}
    </div>
  );
}
describe('karar sonrası kuyruk odağı', () => {
  it('başarılı kaldırmadan sonra sıradaki kaydın ilk eylemine gider', async () => {
    const { user } = renderUi(<Queue />);
    await user.click(screen.getByRole('button', { name: 'first' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'second' })).toHaveFocus());
  });
  it('son kayıt bitince kuyruk başlığında kalır', async () => {
    const { user } = renderUi(<Queue ids={['first']} />);
    await user.click(screen.getByRole('button', { name: 'first' }));
    expect(screen.getByRole('heading', { name: 'Kuyruk' })).toHaveFocus();
  });
  it('server yenilemesi gelmeden odağı başka kayda taşımaz', async () => {
    const { user } = renderUi(<Queue delayed />);
    const first = screen.getByRole('button', { name: 'first' });
    await user.click(first);
    expect(first).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Yenileme tamamlandı' }));
    expect(screen.getByRole('button', { name: 'second' })).toHaveFocus();
  });
  it('son satır işlendiğinde önceki kayda sıçramaz, başlığa döner', async () => {
    const { user } = renderUi(<Queue />);
    await user.click(screen.getByRole('button', { name: 'second' }));
    expect(screen.getByRole('heading', { name: 'Kuyruk' })).toHaveFocus();
  });
});
