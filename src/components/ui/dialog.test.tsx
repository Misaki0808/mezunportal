// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Modal, Sheet } from './dialog';

// jsdom'da <dialog>.showModal/close yok; tarayıcı davranışının açık/kapalı niteliği taklit edilir.
// Tab sırası ve olayların pencere katmanı burada; yerel dialog davranışı ayrıca gerçek tarayıcıda sınanır.
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

  it('tarayıcı varsayılan odağı değiştirmese de ara denetimler arasında Tab ve Shift+Tab ilerler', () => {
    renderUi(
      <Component open onClose={() => undefined} title="Başlık" footer={<button>Vazgeç</button>}>
        <input aria-label="Gerekçe" />
      </Component>,
    );
    const input = screen.getByLabelText('Gerekçe');
    const next = screen.getByRole('button', { name: 'Vazgeç' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(next).toHaveFocus();
    fireEvent.keyDown(next, { key: 'Tab', shiftKey: true });
    expect(input).toHaveFocus();
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

  it('sekme dışı, devre dışı, inert ve gizli denetimleri atlar', () => {
    renderUi(
      <Component open onClose={() => undefined} title="Başlık">
        <input aria-label="Birinci" />
        <button tabIndex={-1}>Sekme dışında</button>
        <button disabled tabIndex={0}>
          Devre dışı
        </button>
        <fieldset disabled>
          <input aria-label="Devre dışı alan" />
        </fieldset>
        <div inert>
          <button>Etkisiz</button>
        </div>
        <div style={{ display: 'none' }}>
          <button>Gizli</button>
        </div>
        <input aria-label="İkinci" />
      </Component>,
    );
    const first = screen.getByLabelText('Birinci');
    const second = screen.getByLabelText('İkinci');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true });
    expect(first).toHaveFocus();
  });

  it('iç içe Sheet içindeki Tab yalnız üst pencerede bir adım ilerler', () => {
    renderUi(
      <Component open onClose={() => undefined} title="Dış pencere">
        <input aria-label="Dış alan" />
        <Sheet open onClose={() => undefined} title="İç pencere" footer={<button>İç son</button>}>
          <input aria-label="İç birinci" />
          <input aria-label="İç ikinci" />
        </Sheet>
        <button>Dış son</button>
      </Component>,
    );
    const first = screen.getByLabelText('İç birinci');
    const second = screen.getByLabelText('İç ikinci');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true });
    expect(first).toHaveFocus();
  });

  it('iç pencerenin Esc ve kapanma olayı dış pencereyi kapatmaz', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    renderUi(
      <Component open onClose={outerClose} title="Dış pencere">
        <Sheet open onClose={innerClose} title="İç pencere">
          <input aria-label="İç alan" />
        </Sheet>
      </Component>,
    );
    const inner = screen.getByRole('dialog', { name: 'İç pencere' });
    fireEvent(inner, new Event('cancel', { cancelable: true }));
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
    fireEvent(inner, new Event('close'));
    expect(innerClose).toHaveBeenCalledTimes(2);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('odaklanabilir denetim kalmadığında kapsayıcıya odak verir', () => {
    renderUi(
      <>
        <button type="button">Dışarıdaki</button>
        <Component open onClose={() => undefined} title="Başlık">
          <p>İçerik</p>
        </Component>
      </>,
    );
    const dialog = screen.getByRole('dialog');
    // jsdom yerel dialog odaklanabilirliğini sağlamaz; tarayıcıdaki programatik odağı taklit et.
    dialog.tabIndex = -1;
    within(dialog).getByRole('button', { name: 'Kapat' }).setAttribute('disabled', '');
    screen.getByRole('button', { name: 'Dışarıdaki' }).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
  });

  describe('ilk odak', () => {
    // Tarayıcının showModal() odaklama adımı: belgedeki ilk odaklanabilir öğe (başlıktaki Kapat).
    beforeAll(() => {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button, input, textarea, select, a[href]')?.focus();
      };
    });

    it('"Kapat"ta değil, içeriğin ilk alanında başlar', () => {
      renderUi(
        <Component open onClose={() => undefined} title="Başlık">
          <label>
            Gerekçe
            <textarea />
          </label>
        </Component>,
      );
      expect(screen.getByLabelText('Gerekçe')).toHaveFocus();
    });

    it("içerikte alan yoksa altbilgideki ilk düğmeye, o da yoksa Kapat'a verilir", () => {
      const footer = renderUi(
        <Component open onClose={() => undefined} title="Başlık" footer={<button>Vazgeç</button>}>
          <p>Metin</p>
        </Component>,
      );
      expect(screen.getByRole('button', { name: 'Vazgeç' })).toHaveFocus();
      footer.unmount();
      renderUi(
        <Component open onClose={() => undefined} title="Başlık">
          <p>Metin</p>
        </Component>,
      );
      expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus();
    });

    it('tarayıcı odağı zaten içeriğe verdiyse (autofocus niteliği) değiştirilmez', () => {
      const native = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('[aria-label="İkinci"]')?.focus();
      };
      renderUi(
        <Component open onClose={() => undefined} title="Başlık">
          <input aria-label="Birinci" />
          <input aria-label="İkinci" />
        </Component>,
      );
      HTMLDialogElement.prototype.showModal = native;
      expect(screen.getByLabelText('İkinci')).toHaveFocus();
    });
  });
});

describe('kaydırma kilidi', () => {
  const locked = () =>
    document.documentElement.style.overflow === 'hidden' &&
    document.body.style.overflow === 'hidden';

  it('açıkken arka sayfa kilitlenir, kapanınca ve sökülünce önceki değer döner', () => {
    document.documentElement.style.overflow = 'clip';
    const { rerender, unmount } = renderUi(
      <Modal open={false} onClose={() => undefined} title="Başlık">
        <p>İçerik</p>
      </Modal>,
    );
    expect(locked()).toBe(false);
    rerender(
      <Modal open onClose={() => undefined} title="Başlık">
        <p>İçerik</p>
      </Modal>,
    );
    expect(locked()).toBe(true);
    rerender(
      <Modal open={false} onClose={() => undefined} title="Başlık">
        <p>İçerik</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.body.style.overflow).toBe('');
    rerender(
      <Modal open onClose={() => undefined} title="Başlık">
        <p>İçerik</p>
      </Modal>,
    );
    expect(locked()).toBe(true);
    unmount();
    expect(document.documentElement.style.overflow).toBe('clip');
    document.documentElement.style.overflow = '';
  });

  it('iç içe iki pencere: biri kapanınca kilit kalır, ikisi kapanınca kalkar', () => {
    const tree = (a: boolean, b: boolean) => (
      <>
        <Modal open={a} onClose={() => undefined} title="Bir">
          <p>1</p>
        </Modal>
        <Sheet open={b} onClose={() => undefined} title="İki">
          <p>2</p>
        </Sheet>
      </>
    );
    const { rerender } = renderUi(tree(true, true));
    expect(locked()).toBe(true);
    rerender(tree(false, true));
    expect(locked()).toBe(true);
    rerender(tree(false, false));
    expect(locked()).toBe(false);
  });
});
