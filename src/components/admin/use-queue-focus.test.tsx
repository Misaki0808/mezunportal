// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { useQueueFocus } from './use-queue-focus';
function Queue({
  ids = ['first', 'second'],
  delayed = false,
  blocked = false,
  alternate = false,
  headingTabIndex,
}: {
  ids?: string[];
  delayed?: boolean;
  blocked?: boolean;
  alternate?: boolean;
  headingTabIndex?: number;
}) {
  const [rows, setRows] = useState(ids);
  const { rootRef, complete } = useQueueFocus();
  return (
    <div ref={rootRef}>
      <h1 tabIndex={headingTabIndex}>Kuyruk</h1>
      {rows.map((id) => (
        <div data-queue-row={id} key={id}>
          <button
            data-queue-action
            disabled={blocked && id === 'second'}
            onClick={() => {
              complete(id);
              if (!delayed) setRows(rows.filter((x) => x !== id));
            }}
          >
            {id}
          </button>
          {id === 'second' && alternate && <button data-queue-action>second reject</button>}
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

it('sıradaki ilk karar kapalıysa kullanılabilir ret eylemini bulur', async () => {
  const { user } = renderUi(<Queue blocked alternate />);
  await user.click(screen.getByRole('button', { name: 'first' }));
  expect(screen.getByRole('button', { name: 'second reject' })).toHaveFocus();
});
it('sıradaki kaydın kullanılabilir eylemi yoksa odağı gövdede bırakmaz', async () => {
  const { user } = renderUi(<Queue blocked />);
  await user.click(screen.getByRole('button', { name: 'first' }));
  expect(screen.getByRole('heading', { name: 'Kuyruk' })).toHaveFocus();
});

it('geçici başlık tabindex değeri blur sonrası kaldırılır', async () => {
  const { user } = renderUi(<Queue ids={['first']} />);
  await user.click(screen.getByRole('button', { name: 'first' }));
  const heading = screen.getByRole('heading', { name: 'Kuyruk' });
  expect(heading).toHaveFocus();
  expect(heading).toHaveAttribute('tabindex', '-1');
  heading.blur();
  expect(heading).not.toHaveAttribute('tabindex');
});

it('başlığın mevcut tabindex değeri odak ve blur boyunca korunur', async () => {
  const { user } = renderUi(<Queue ids={['first']} headingTabIndex={0} />);
  await user.click(screen.getByRole('button', { name: 'first' }));
  const heading = screen.getByRole('heading', { name: 'Kuyruk' });
  expect(heading).toHaveFocus();
  expect(heading).toHaveAttribute('tabindex', '0');
  heading.blur();
  expect(heading).toHaveAttribute('tabindex', '0');
});
it('blur olmadan bileşen kaldırılırsa geçici tabindex kalmaz', async () => {
  const { user, unmount } = renderUi(<Queue ids={['first']} />);
  await user.click(screen.getByRole('button', { name: 'first' }));
  const heading = screen.getByRole('heading', { name: 'Kuyruk' });
  unmount();
  expect(heading).not.toHaveAttribute('tabindex');
});
