import { NextResponse } from 'next/server';

// Next.js 16: `middleware.ts` yerine `proxy.ts`. Şimdilik iskelet; kimlik/oturum yönlendirmeleri
// Faz 1'de (P1-02) buraya gelir. Yetkilendirme proxy'de değil, her sunucu eyleminde ve rotada
// yapılır (`src/server/permissions`).
export function proxy() {
  return NextResponse.next();
}

export const config = {
  // Statik dosyalar ve görseller proxy'den geçmez.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
