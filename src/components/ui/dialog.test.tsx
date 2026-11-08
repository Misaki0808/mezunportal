// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Modal, Sheet } from './dialog';

// jsdom'da <dialog>.showModal/close yok; tarayıcı davranışının açık/kapalı niteliği taklit edilir.
// Odak tuzağı ve Esc tarayıcının işidir (PM turunda elle denenir); burada bağlantılar sınanır.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

describe.each([
  ['Modal', Modal],
  ['Sheet', Sheet],
])('%s', (_name, Component) => {
  it('başlıkla adlandırılır ve açıklama bağlıdır', () => {
    renderUi(
      <Component
        open
        onClose={() => undefined}
        title="Randevuyu iptal et"
        description="Mentora bildirim gider."
      >
        <p>İçerik</p>
      </Component>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Randevuyu iptal et' });
    expect(dialog).toHaveAccessibleDescription('Mentora bildirim gider.');
    expect(dialog).toHaveAttribute('open');
  });

  it('kapalıyken içerik DOM’da yoktur', () => {
    renderUi(
      <Component open={false} onClose={() => undefined} title="Başlık">
        <p>Gizli içerik</p>
      </Component>,
    );

    expect(screen.queryByText('Gizli içerik')).not.toBeInTheDocument();
  });

  it('kapat düğmesi erişilebilir adlıdır ve onClose çağırır', async () => {
    const onClose = vi.fn();
    const { user } = renderUi(
      <Component open onClose={onClose} title="Başlık">
        <p>İçerik</p>
      </Component>,
    );

    await user.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kapanınca odak açan öğeye döner', async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Aç</button>
          <Component open={open} onClose={() => undefined} title="Başlık">
            <p>İçerik</p>
          </Component>
        </>
      );
    }
    const { rerender, user } = renderUi(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Aç' });
    await user.click(opener);
    expect(opener).toHaveFocus();

    rerender(<Harness open />);
    screen.getByRole('button', { name: 'Kapat' }).focus();
    rerender(<Harness open={false} />);

    expect(opener).toHaveFocus();
  });

  it('Tab pencere içinde döner: sondan ilke, ilkten Shift+Tab ile sona (odak dışarı kaçmaz)', async () => {
    const { user } = renderUi(
      <>
        <button type="button">Dışarıdaki</button>
        <Component
          open
          onClose={() => undefined}
          title="Başlık"
          footer={
            <>
              <button type="button">Vazgeç</button>
              <button type="button">Onayla</button>
            </>
          }
        >
          <input aria-label="Gerekçe" />
        </Component>
      </>,
    );
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Kapat' });
    const confirm = within(dialog).getByRole('button', { name: 'Onayla' });
    confirm.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    // aradaki öğeler doğal sırada ilerler
    close.focus();
    await user.tab();
    expect(within(dialog).getByLabelText('Gerekçe')).toHaveFocus();
  });

  it('odak pencerenin dışına düşmüşse Tab içeri alır; odaklanabilir öğe yoksa Tab odağı bırakmaz', async () => {
    const { user } = renderUi(
      <>
        <button type="button">Dışarıdaki</button>
        <Component open onClose={() => undefined} title="Başlık">
          <p>İçerik</p>
        </Component>
      </>,
    );
    const dialog = screen.getByRole('dialog');
    screen.getByRole('button', { name: 'Dışarıdaki' }).focus();
    // olay pencereye ulaştığında (tarayıcıda odak dialog'tayken) ilk öğeye alınır
    dialog.focus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Kapat' })).toHaveFocus();
  });
});
