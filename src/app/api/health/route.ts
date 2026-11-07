import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { buildHealth } from '@/lib/health';
import { pingDatabase } from '@/server/db';

// Sağlık yanıtı her istekte taze üretilir; önbelleğe alınmaz.
export const dynamic = 'force-dynamic';

export async function GET() {
  const body = buildHealth(getEnv(), await pingDatabase());
  return NextResponse.json(body, {
    status: body.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
