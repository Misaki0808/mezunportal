'use server';

import {
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
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { requireUser, requireVerifiedMember } from '../permissions';
import * as service from '../services/contactRequest';

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
    const result = await service.sendContactRequest(getDb(), actor.userId, parsed.data);
    return actionOk(result);
  } catch (error) {
    return actionFailure(error);
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
    return actionFailure(error);
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
    return actionFailure(error);
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
    return actionFailure(error);
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
    return actionFailure(error);
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
    return actionOk(await service.previewContactTarget(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
