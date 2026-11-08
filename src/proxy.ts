import { NextResponse, type NextRequest } from 'next/server';

import { REQUEST_PATH_HEADER } from '@/lib/return-path';

// Next.js 16: `middleware.ts` yerine `proxy.ts`. Yetkilendirme proxy'de değil, her sunucu eyleminde ve
// rotada yapılır (`src/server/permissions`). Proxy yalnız istenen yolu sunucu düzenlerine taşır: oturumsuz
// ya da onayı eksik kullanıcı girişe/onaya yönlenirken dönüş yolu (`?donus=`) bundan üretilir.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // İstemcinin aynı adla gönderdiği değer her zaman ezilir.
  headers.set(REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Statik dosyalar ve görseller proxy'den geçmez.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
