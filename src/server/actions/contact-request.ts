'use server';

import {
  CONTACT_TARGET_NOT_REQUESTABLE,
  closeContactRequestSchema,
  listContactRequestsSchema,
  previewContactTargetSchema,
  respondToContactRequestSchema,
  sendContactRequestSchema,
  type CloseContactRequestInput,
  type ContactRequestPage,
  type ContactTargetPreview,
  type ContactRequestStatusOutput,
  type ListContactRequestsInput,
  type PreviewContactTargetInput,
  type RespondToContactRequestInput,
  type SendContactRequestInput,
  type SendContactRequestOutput,
} from '@/contracts/contact-request';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { codedNotFound } from '@/lib/errors';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireUser, requireVerifiedMember, type Actor } from '../permissions';
import { viewerUniversityIds } from '../services/search';
import { consumeRateLimit, RATE_LIMITS } from '../services/rateLimit';
import * as service from '../services/contactRequest';

/** Profil üzerinden talep yalnız aynı üniversitenin etkin ve doğrulanmış üyesine açıktır (K-07). */
async function canContactProfile(actor: Actor, targetUserId: string): Promise<boolean> {
  const db = getDb();
  const universities = await viewerUniversityIds(db, actor);
  const membership = await db.membership.findFirst({
    where: {
      userId: targetUserId,
      endedAt: null,
      verificationStatus: 'VERIFIED',
      department: { faculty: { universityId: { in: universities } } },
    },
    select: { id: true },
  });
  return membership !== null;
}

/**
 * İletişim talebi eylemleri: göndermek doğrulanmış etkin üyelik ister; yanıt/geri alma/geri çekme ve liste
 * oturum ister ve servis yalnız kullanıcının kendi taraflı taleplerine dokunur (`RESOURCE_NOT_FOUND`).
 */

export async function sendContactRequest(
  input: SendContactRequestInput,
): Promise<ActionResult<SendContactRequestOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(sendContactRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    if (!(await canContactProfile(actor, parsed.data.targetUserId))) {
      await consumeRateLimit(getDb(), RATE_LIMITS.contactRequest, actor.userId);
      throw codedNotFound('RESOURCE_NOT_FOUND');
    }
    const result = await service.sendContactRequest(getDb(), actor.userId, parsed.data);
    return actionOk(result);
  } catch (error) {
    return failAction(error);
  }
}

export async function respondToContactRequest(
  input: RespondToContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(respondToContactRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.respondToContactRequest(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function withdrawContactRequest(
  input: CloseContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(closeContactRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.withdrawContactRequest(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function revokeContactRequest(
  input: CloseContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(closeContactRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.revokeContactRequest(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listContactRequests(
  input: ListContactRequestsInput,
): Promise<ActionResult<ContactRequestPage>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(listContactRequestsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.listContactRequests(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/**
 * Talep formundan önce hedef önizlemesi: doğrulanmış üye ister, hız sınırlıdır; talep edilemeyen her
 * hedef (yok, silinmiş, askıda, kendisi, talep alanı yok) için aynı genel yanıt döner.
 */
export async function previewContactTarget(
  input: PreviewContactTargetInput,
): Promise<ActionResult<ContactTargetPreview>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(previewContactTargetSchema, input);
    if (!parsed.ok) return parsed.failure;
    const result = await service.previewContactTarget(getDb(), actor.userId, parsed.data);
    return actionOk(
      (await canContactProfile(actor, parsed.data.targetUserId))
        ? result
        : CONTACT_TARGET_NOT_REQUESTABLE,
    );
  } catch (error) {
    return failAction(error);
  }
}
