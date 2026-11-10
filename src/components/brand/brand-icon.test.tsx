import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BrandIcon } from './brand-icon';

const decode = (html: string) => {
  const match = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html);
  return Buffer.from(match?.[1] ?? '', 'base64').toString('utf8');
};

describe('BrandIcon', () => {
  it('favicon yumuşak köşeli, Apple/maskable simgesi tam kaplayan zemindir', () => {
    expect(decode(renderToStaticMarkup(<BrandIcon size={32} />))).toContain('rx="112"');
    expect(decode(renderToStaticMarkup(<BrandIcon size={180} full />))).toContain('rx="0"');
  });

  it('boyut istenen kadardır ve simge kepli "o"dur (yazı yok)', () => {
    const html = renderToStaticMarkup(<BrandIcon size={192} full />);
    expect(html).toContain('width="192"');
    expect(html).toContain('height="192"');
    expect(decode(html)).not.toContain('<text');
  });
});
