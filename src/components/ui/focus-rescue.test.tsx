// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { captureFocus, focusFirstInvalid, rescueFocus, resultTarget } from './focus-rescue';

function page() {
  document.body.innerHTML = `
    <main>
      <h1>Sayfa başlığı</h1>
      <p data-focus-result>Sonuç metni</p>
      <button id="trigger">Eylem</button>
      <button id="other">Başka</button>
    </main>`;
  return {
    trigger: document.getElementById('trigger') as HTMLButtonElement,
    other: document.getElementById('other') as HTMLButtonElement,
    h1: document.querySelector('h1') as HTMLElement,
    result: document.querySelector('[data-focus-result]') as HTMLElement,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('captureFocus', () => {
  it('hiçbir şey odakta değilse null döner (kurtarılacak klavye bağlamı yok)', () => {
    page();
    expect(captureFocus()).toBeNull();
  });
  it('odaktaki öğeyi döner', () => {
    const { trigger } = page();
    trigger.focus();
    expect(captureFocus()).toBe(trigger);
  });
});

describe('rescueFocus', () => {
  it('tetikleyici kalkarsa odak sonuç işaretli öğeye gider ve geçici tabindex odak çıkınca silinir', async () => {
    const { trigger, other, result } = page();
    trigger.focus();
    const held = captureFocus();
    trigger.remove();
    rescueFocus(held);
    await waitFor(() => expect(result).toHaveFocus());
    expect(result).toHaveAttribute('tabindex', '-1');
    other.focus();
    expect(result).not.toHaveAttribute('tabindex');
  });

  it('sonuç işareti yoksa ana başlığa gider', async () => {
    const { trigger, h1, result } = page();
    result.remove();
    trigger.focus();
    const held = captureFocus();
    trigger.remove();
    rescueFocus(held);
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it('tetikleyici kalıcı pasifleşirse (düğme "bitti" durumunda) sonuca gider', async () => {
    const { trigger, result } = page();
    trigger.focus();
    const held = captureFocus();
    trigger.disabled = true;
    trigger.blur();
    rescueFocus(held);
    await waitFor(() => expect(result).toHaveFocus());
  });

  it('tetikleyici yalnız geçici pasifleşip yeniden açılırsa düğmeye döner', async () => {
    const { trigger } = page();
    trigger.focus();
    const held = captureFocus();
    trigger.disabled = true;
    trigger.blur();
    rescueFocus(held);
    setTimeout(() => (trigger.disabled = false), 70);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('odağı başka bir öğe aldıysa (pencere kendi dönüşünü yaptı) çalmaz', async () => {
    const { trigger, other, result } = page();
    trigger.focus();
    const held = captureFocus();
    trigger.remove();
    other.focus();
    rescueFocus(held);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(other).toHaveFocus();
    expect(result).not.toHaveFocus();
  });

  it('düğme eylemden SONRA (sayfa değişimi gibi) kalkarsa yeni sayfanın başlığına gider', async () => {
    const { trigger } = page();
    trigger.focus();
    rescueFocus(captureFocus());
    setTimeout(() => {
      document.body.innerHTML = '<main><h1 id="yeni">Yeni sayfa</h1></main>';
    }, 150);
    await waitFor(() => expect(document.getElementById('yeni')).toHaveFocus());
  });

  it('sayfa değişirken yükleme iskeleti (başlıksız main) ana alana odak çalmaz; başlık gelince ona gider', async () => {
    const { trigger } = page();
    trigger.focus();
    rescueFocus(captureFocus());
    setTimeout(() => {
      document.body.innerHTML = '<main id="iskelet"><div>Yükleniyor</div></main>';
    }, 100);
    setTimeout(() => {
      document.getElementById('iskelet')!.innerHTML = '<h1 id="baslik">İlanlarım</h1>';
    }, 400);
    await waitFor(() => expect(document.getElementById('baslik')).toHaveFocus());
    expect(document.getElementById('iskelet')).not.toHaveAttribute('tabindex');
  });

  it('başlık hiç gelmezse süre dolmaya yakın ana alana düşer', async () => {
    const { trigger } = page();
    trigger.focus();
    rescueFocus(captureFocus(), { timeoutMs: 1200 });
    document.body.innerHTML = '<main id="yalniz"><p>İçerik</p></main>';
    await waitFor(() => expect(document.getElementById('yalniz')).toHaveFocus(), { timeout: 2000 });
  });

  it('tetikleyici null ise (fare/dokunma, odak yok) hiçbir şey yapmaz', async () => {
    const { result } = page();
    rescueFocus(null);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(result).not.toHaveFocus();
  });
});

describe('resultTarget / focusFirstInvalid', () => {
  it('gizli sonuç işaretini atlar', () => {
    const { result, h1 } = page();
    result.hidden = true;
    expect(resultTarget()).toBe(h1);
  });
  it('ilk aria-invalid alanına odaklanır, yoksa false döner', () => {
    document.body.innerHTML =
      '<form><input id="a"/><input id="b" aria-invalid="true"/><input id="c" aria-invalid="true"/></form>';
    expect(focusFirstInvalid(document.querySelector('form'))).toBe(true);
    expect(document.getElementById('b')).toHaveFocus();
    document.body.innerHTML = '<form><input/></form>';
    expect(focusFirstInvalid(document.querySelector('form'))).toBe(false);
  });
});
