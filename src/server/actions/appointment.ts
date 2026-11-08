'use server';

import {
  appointmentIdSchema,
  cancelAppointmentSchema,
  listMyAppointmentsSchema,
  listSlotsSchema,
  requestAppointmentSchema,
  respondAppointmentSchema,
  saveAvailabilitySchema,
  saveMentorSettingsSchema,
  setMeetLinkSchema,
  setPauseSchema,
  type AppointmentIdInput,
  type AppointmentPage,
  type AppointmentView,
  type CancelAppointmentInput,
  type ListMyAppointmentsInput,
  type ListSlotsInput,
  type MentorSettingsView,
  type RequestAppointmentInput,
  type RespondAppointmentInput,
  type SaveAvailabilityInput,
  type SaveMentorSettingsInput,
  type SetMeetLinkInput,
  type SetPauseInput,
  type SlotList,
} from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { requireVerifiedMember } from '../permissions';
import * as appointments from '../services/appointment';
import { appointmentDeps } from './deps';

/**
 * Randevu motoru eylemleri (hata kodları: `APPOINTMENT_ACTION_ERRORS`). Sıra: koruma → Zod → servis. Kimlik oturumdan
 * gelir; istemci kimliği yalnız hedefi gösterir ve yetki vermez (servis yetkiyi işlemin içinde yeniden yükler).
 */

export async function getMyMentorSettings(): Promise<ActionResult<MentorSettingsView>> {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await appointments.getMyMentorSettings(appointmentDeps(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

export async function saveMentorSettings(
  input: SaveMentorSettingsInput,
): Promise<ActionResult<MentorSettingsView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(saveMentorSettingsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.saveMentorSettings(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** Haftalık müsaitliğin TAMAMINI yerine koyar. */
export async function saveAvailability(
  input: SaveAvailabilityInput,
): Promise<ActionResult<MentorSettingsView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(saveAvailabilitySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.saveAvailability(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** "Müsait değilim" modu. */
export async function setPause(input: SetPauseInput): Promise<ActionResult<MentorSettingsView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(setPauseSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await appointments.setPause(appointmentDeps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listSlots(input: ListSlotsInput): Promise<ActionResult<SlotList>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listSlotsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await appointments.listSlots(appointmentDeps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function requestAppointment(
  input: RequestAppointmentInput,
): Promise<ActionResult<AppointmentView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(requestAppointmentSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.requestAppointment(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** Mentorun onay/ret kararı. */
export async function respondAppointment(
  input: RespondAppointmentInput,
): Promise<ActionResult<AppointmentView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(respondAppointmentSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.respondAppointment(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function cancelAppointment(
  input: CancelAppointmentInput,
): Promise<ActionResult<AppointmentView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(cancelAppointmentSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.cancelAppointment(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** Takvim linki oluşmadığında mentorun elle eklediği görüşme bağlantısı. */
export async function setMeetLink(input: SetMeetLinkInput): Promise<ActionResult<AppointmentView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(setMeetLinkSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await appointments.setMeetLink(appointmentDeps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listMyAppointments(
  input: ListMyAppointmentsInput,
): Promise<ActionResult<AppointmentPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listMyAppointmentsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.listMyAppointments(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function getAppointment(
  input: AppointmentIdInput,
): Promise<ActionResult<AppointmentView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(appointmentIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await appointments.getAppointment(appointmentDeps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}
