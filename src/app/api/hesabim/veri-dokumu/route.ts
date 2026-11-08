import { NextResponse } from 'next/server';

import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { requireUserWithoutConsent } from '@/server/permissions';
import { buildDataExport } from '@/server/services/dataExport';
import { RATE_LIMITS, consumeRateLimit } from '@/server/services/rateLimit';

// Veri dökümü (KVKK m. 11): yalnız oturumdaki kullanıcının kendi verisi; her istekte taze, önbelleksiz.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const actor = await requireUserWithoutConsent();
    const db = getDb();
    await consumeRateLimit(db, RATE_LIMITS.dataExport, actor.userId);
    const data = await buildDataExport(db, actor.userId);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mezunportal-verilerim.json"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isCodedError(error)) {
      return NextResponse.json(
        { errorCode: error.code },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { errorCode: 'SERVER_UNEXPECTED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
