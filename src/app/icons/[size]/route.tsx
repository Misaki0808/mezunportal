import { ImageResponse } from 'next/og';

import { BrandIcon } from '@/components/brand/brand-icon';

// Web app manifest simgeleri: /icons/192 ve /icons/512 (PNG). Tam kapla zemin olduğu için
// "maskable" olarak da kullanılabilir.
const SIZES = { '192': 192, '512': 512 } as const;

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = SIZES[size as keyof typeof SIZES];
  if (!px) return new Response(null, { status: 404 });
  return new ImageResponse(<BrandIcon size={px} full />, { width: px, height: px });
}
