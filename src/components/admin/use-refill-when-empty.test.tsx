// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRefillWhenEmpty } from './use-refill-when-empty';

type Props = { empty: boolean; cursor: string | null; busy: boolean };
const setup = (initial: Props, load = vi.fn()) => ({
  load,
  ...renderHook((props: Props) => useRefillWhenEmpty({ ...props, load }), {
    initialProps: initial,
  }),
});

describe('kuyruk boşalınca sıradaki sayfa', () => {
  it('boş ve imleç varsa bir kez yükler', () => {
    const { load, rerender } = setup({ empty: true, cursor: 'c1', busy: false });
    expect(load).toHaveBeenCalledTimes(1);
    rerender({ empty: true, cursor: 'c1', busy: false });
    expect(load).toHaveBeenCalledTimes(1); // aynı imleç için yeniden denemez
  });
  it('öğe varken, imleç yokken ve meşgulken yüklemez', () => {
    expect(setup({ empty: false, cursor: 'c1', busy: false }).load).not.toHaveBeenCalled();
    expect(setup({ empty: true, cursor: null, busy: false }).load).not.toHaveBeenCalled();
    expect(setup({ empty: true, cursor: 'c1', busy: true }).load).not.toHaveBeenCalled();
  });
  it('meşguliyet bitince ve yeni imleç gelince yeniden yükler', () => {
    const { load, rerender } = setup({ empty: true, cursor: 'c1', busy: true });
    rerender({ empty: true, cursor: 'c1', busy: false });
    expect(load).toHaveBeenCalledTimes(1);
    rerender({ empty: false, cursor: 'c2', busy: false });
    rerender({ empty: true, cursor: 'c2', busy: false });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
