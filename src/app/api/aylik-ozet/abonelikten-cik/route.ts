import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '@/server/db';
import { unsubscribeMonthlyDigest } from '@/server/services/digest-unsubscribe';

const input = z.object({ token: z.string().max(320) }).strict();

// İmzalı bağlantıyla kişinin kendi isteğe bağlı tercihini kapatması için açık istisna.
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length <= 1024) {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
    const parsed = input.safeParse(value);
    if (parsed.success)
      await unsubscribeMonthlyDigest(getDb(), parsed.data.token, getAuthEnv().BETTER_AUTH_SECRET);
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
