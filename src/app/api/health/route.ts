import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { buildHealth } from '@/lib/health';

// Sağlık yanıtı her istekte taze üretilir; önbelleğe alınmaz.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(buildHealth(getEnv()), { headers: { 'Cache-Control': 'no-store' } });
}
