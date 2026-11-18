// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { ambiguousLinkNames } from './link-names';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ambiguousLinkNames', () => {
  it('aynı ad iki farklı hedefe gidiyorsa bildirir', () => {
    document.body.innerHTML = '<a href="/a">Staj</a><a href="/b">Staj</a>';
    expect(ambiguousLinkNames()).toEqual(['"Staj" → /a | /b']);
  });

  it('ardışık boşluk ve uç boşlukla ayrışan adlar aynı sayılır (tarayıcı erişilebilir adı böyle hesaplar)', () => {
    document.body.innerHTML =
      '<a href="/a">Yurt dışı eğitim</a><a href="/b">Yurt  dışı\n  eğitim</a><a href="/c"> Yurt dışı eğitim </a>';
    expect(ambiguousLinkNames()).toEqual(['"Yurt dışı eğitim" → /a | /b | /c']);
  });

  it('büyük/küçük harf farkı ayrı addır; aynı ad aynı hedefte ya da aria-label ile ayrılmışsa sorun yok', () => {
    document.body.innerHTML =
      '<a href="/a">Staj</a><a href="/b">staj</a><a href="/c">Aç</a><a href="/c">Aç</a><a href="/d" aria-label="X, 1/2">Aç</a>';
    expect(ambiguousLinkNames()).toEqual([]);
  });
});
