import { describe, expect, it } from 'vitest';
import { YBS_COURSES } from './seed-courses-data';

describe('YBS ders listesi', () => {
  it('89 dersin tümünü ve aynı kodlu farklı yarıyılları korur', () => {
    expect(YBS_COURSES).toHaveLength(89);
    expect(YBS_COURSES.filter((course) => course.elective)).toHaveLength(53);
    expect(new Set(YBS_COURSES.map(({ code, semester }) => `${code}:${semester}`)).size).toBe(89);
    expect(
      YBS_COURSES.filter(({ code }) => code === 'FOYD0014').map(({ semester }) => semester),
    ).toEqual([6, 8]);
  });
});
