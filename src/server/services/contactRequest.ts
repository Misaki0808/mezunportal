import 'server-only';

import type {
  ContactRequestItem,
  ContactRequestPage,
  ContactRequestStatus,
  ContactRequestStatusOutput,
  SendContactRequestOutput,
} from '@/contracts/contact-request';
import type { ContactField, VisibilityLevel } from '@/contracts/privacy';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedNotFound, codedValidation } from '@/lib/errors';

import { effectiveLevel, fieldAccess } from '../rules/visibility';
import { loadVisibilityLevels } from './privacy';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';

/**
 * İletişim talebi servisi (P1-03; D7). Yetki eylem katmanında: göndermek doğrulanmış üyelik ister;
 * burada kimlik o korumadan gelir. Başkasının talebine dokunma girişimi `RESOURCE_NOT_FOUND` olur (talebin
 * varlığı sızmaz). Durum geçişleri koşullu güncellemeyle yapılır: eşzamanlı iki istekten yalnız biri geçer.
 */

const OPEN_PAIR_INDEX = 'ContactRequest_open_pair_key';

function isOpenPairViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      JSON.stringify(error.meta ?? {}).includes(OPEN_PAIR_INDEX)) ||
    (error instanceof Error && error.message.includes(OPEN_PAIR_INDEX))
  );
}

export async function sendContactRequest(
  db: PrismaClient,
  requesterId: string,
  input: { targetUserId: string; fields: ContactField[]; message?: string | null },
  now: Date = new Date(),
): Promise<SendContactRequestOutput> {
  if (input.targetUserId === requesterId) throw codedValidation('CONTACT_REQUEST_SELF');
  await consumeRateLimit(db, RATE_LIMITS.contactRequest, requesterId, now);

  const target = await db.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, deletedAt: true, banned: true },
  });
  if (!target || target.deletedAt || target.banned) throw codedNotFound('RESOURCE_NOT_FOUND');

  // Yalnız “onaylı talebe açık” alanlar istenebilir: PRIVATE kimseye açılmaz, MEMBERS zaten görünür.
  const levels = (await loadVisibilityLevels(db, [target.id])).get(target.id) ?? new Map();
  if (input.fields.some((field) => effectiveLevel(field, levels) !== 'ON_APPROVED_REQUEST')) {
    throw codedValidation('CONTACT_FIELD_NOT_REQUESTABLE');
  }

  try {
    const created = await db.contactRequest.create({
      data: {
        requesterId,
        targetId: target.id,
        fields: input.fields,
        message: input.message ?? null,
      },
      select: { id: true },
    });
    return { requestId: created.id, status: 'PENDING' };
  } catch (error) {
    if (isOpenPairViolation(error)) throw codedConflict('CONTACT_REQUEST_ALREADY_OPEN');
    throw error;
  }
}

type Transition = {
  /** Talepteki hangi taraf bu geçişi yapabilir. */
  side: 'targetId' | 'requesterId';
  from: ContactRequestStatus;
  to: ContactRequestStatus;
  stamp: 'decidedAt' | 'closedAt';
  wrongStateCode: 'CONTACT_REQUEST_NOT_PENDING' | 'CONTACT_REQUEST_NOT_APPROVED';
};

async function transition(
  db: PrismaClient,
  actorId: string,
  requestId: string,
  rule: Transition,
  now: Date,
): Promise<ContactRequestStatusOutput> {
  const updated = await db.contactRequest.updateMany({
    where: { id: requestId, [rule.side]: actorId, status: rule.from },
    data: { status: rule.to, [rule.stamp]: now },
  });
  if (updated.count === 1) return { requestId, status: rule.to };
  const own = await db.contactRequest.findFirst({
    where: { id: requestId, [rule.side]: actorId },
    select: { id: true },
  });
  if (!own) throw codedNotFound('RESOURCE_NOT_FOUND');
  throw codedConflict(rule.wrongStateCode);
}

export function respondToContactRequest(
  db: PrismaClient,
  targetId: string,
  input: { requestId: string; decision: 'APPROVE' | 'REJECT' },
  now: Date = new Date(),
): Promise<ContactRequestStatusOutput> {
  return transition(
    db,
    targetId,
    input.requestId,
    {
      side: 'targetId',
      from: 'PENDING',
      to: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      stamp: 'decidedAt',
      wrongStateCode: 'CONTACT_REQUEST_NOT_PENDING',
    },
    now,
  );
}

export function withdrawContactRequest(
  db: PrismaClient,
  requesterId: string,
  input: { requestId: string },
  now: Date = new Date(),
): Promise<ContactRequestStatusOutput> {
  return transition(
    db,
    requesterId,
    input.requestId,
    {
      side: 'requesterId',
      from: 'PENDING',
      to: 'WITHDRAWN',
      stamp: 'closedAt',
      wrongStateCode: 'CONTACT_REQUEST_NOT_PENDING',
    },
    now,
  );
}

export function revokeContactRequest(
  db: PrismaClient,
  targetId: string,
  input: { requestId: string },
  now: Date = new Date(),
): Promise<ContactRequestStatusOutput> {
  return transition(
    db,
    targetId,
    input.requestId,
    {
      side: 'targetId',
      from: 'APPROVED',
      to: 'REVOKED',
      stamp: 'closedAt',
      wrongStateCode: 'CONTACT_REQUEST_NOT_APPROVED',
    },
    now,
  );
}

/**
 * Onaylı giden talepte açılan değerler: istenen alanlar × hedefin GÜNCEL seviyesi × görünürlük kuralı.
 * Hedef sonradan alanı PRIVATE yaparsa değer artık dönmez.
 */
function revealFor(
  fields: readonly ContactField[],
  levels: ReadonlyMap<ContactField, VisibilityLevel>,
  values: { email: string; phone: string | null },
): ContactRequestItem['revealed'] {
  const revealed: NonNullable<ContactRequestItem['revealed']> = {};
  for (const field of fields) {
    const access = fieldAccess({
      field,
      level: effectiveLevel(field, levels),
      relation: 'APPROVED_REQUESTER',
    });
    if (access !== 'FULL') continue;
    if (field === 'EMAIL') revealed.EMAIL = values.email;
    if (field === 'PHONE' && values.phone) revealed.PHONE = values.phone;
    // SOCIAL_LINKS / LINKEDIN profilde (P1-04) gelince buraya eklenir.
  }
  return revealed;
}

export async function listContactRequests(
  db: PrismaClient,
  userId: string,
  input: {
    box: 'INCOMING' | 'OUTGOING';
    status?: ContactRequestStatus;
    cursor?: string;
    limit: number;
  },
): Promise<ContactRequestPage> {
  const where =
    input.box === 'INCOMING'
      ? { targetId: userId, ...(input.status ? { status: input.status } : {}) }
      : { requesterId: userId, ...(input.status ? { status: input.status } : {}) };
  const base = {
    where,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  };
  const common = {
    id: true,
    fields: true,
    message: true,
    status: true,
    createdAt: true,
    decidedAt: true,
    closedAt: true,
  } as const;

  let items: ContactRequestItem[];
  if (input.box === 'INCOMING') {
    // Gelen kutusunda talep edenin YALNIZ kimliği ve adı seçilir; iletişim alanı sorguya bile girmez.
    const rows = await db.contactRequest.findMany({
      ...base,
      select: { ...common, requester: { select: { id: true, name: true } } },
    });
    items = rows.map(({ requester, ...row }) => ({
      ...row,
      counterpart: { userId: requester.id, name: requester.name },
      revealed: null,
    }));
  } else {
    const rows = await db.contactRequest.findMany({
      ...base,
      select: { ...common, target: { select: { id: true, name: true, email: true, phone: true } } },
    });
    const approvedTargets = rows
      .filter((row) => row.status === 'APPROVED')
      .map((row) => row.target.id);
    const levels = await loadVisibilityLevels(db, approvedTargets);
    items = rows.map(({ target, ...row }) => ({
      ...row,
      counterpart: { userId: target.id, name: target.name },
      revealed:
        row.status === 'APPROVED'
          ? revealFor(row.fields, levels.get(target.id) ?? new Map(), target)
          : null,
    }));
  }

  const hasMore = items.length > input.limit;
  const page = hasMore ? items.slice(0, input.limit) : items;
  return { items: page, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}
