'use server';
import {
  courseFilterSchema,
  courseSelectionSchema,
  type CourseFilterInput,
  type CourseSelectionInput,
} from '@/contracts/course-guide';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireVerifiedMember } from '../permissions';
import * as service from '../services/course-guide';

export async function getCourseGuide(input: CourseFilterInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(courseFilterSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.listCourseGuide(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'getCourseGuide');
  }
}
export async function getAlumniCourses() {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    return actionOk(await service.listAlumniCourses(getDb(), actor.userId));
  } catch (error) {
    return failAction(error, 'getAlumniCourses');
  }
}
export async function saveAlumniCourses(input: CourseSelectionInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(courseSelectionSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.saveAlumniCourses(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'saveAlumniCourses');
  }
}
export async function getManagedCourses() {
  try {
    const { requireAnyAdmin } = await import('../permissions');
    const actor = await requireAnyAdmin();
    return actionOk(await service.listManagedCourses(getDb(), actor.userId));
  } catch (error) {
    return failAction(error, 'getManagedCourses');
  }
}
export async function saveCourse(input: import('@/contracts/course-guide').SaveCourseInput) {
  try {
    const { requireAnyAdmin } = await import('../permissions');
    const { saveCourseSchema } = await import('@/contracts/course-guide');
    const actor = await requireAnyAdmin();
    const parsed = parseInput(saveCourseSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.saveCourse(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'saveCourse');
  }
}
