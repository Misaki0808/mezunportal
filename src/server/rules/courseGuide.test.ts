import { describe, expect, it } from 'vitest';
import { courseSelectionSchema } from '@/contracts/course-guide';
import { summarizeCourseMarks } from './courseGuide';

describe('ders rehberi sınırları', () => {
  it('beş dersi kabul eder, altı dersi ve tekrarları reddeder', () => {
    expect(courseSelectionSchema.safeParse({ courseIds: ['1', '2', '3', '4', '5'] }).success).toBe(
      true,
    );
    expect(
      courseSelectionSchema.safeParse({ courseIds: ['1', '2', '3', '4', '5', '6'] }).success,
    ).toBe(false);
    expect(courseSelectionSchema.safeParse({ courseIds: ['1', '1'] }).success).toBe(false);
  });
  it('üçten az işarette sayıyı ve sektörleri gizler', () => {
    expect(summarizeCourseMarks(2, [{ name: 'A', count: 2 }])).toEqual({
      count: null,
      sectors: [],
    });
    expect(summarizeCourseMarks(3, [{ name: 'A', count: 3 }])).toEqual({
      count: 3,
      sectors: ['A'],
    });
  });
  it('küçük sektörün tamamlayıcısını da gizler', () => {
    expect(summarizeCourseMarks(4, [{ name: 'A', count: 3 }])).toEqual({ count: 4, sectors: [] });
    expect(
      summarizeCourseMarks(5, [
        { name: 'A', count: 3 },
        { name: 'B', count: 2 },
      ]),
    ).toEqual({ count: 5, sectors: [] });
    expect(
      summarizeCourseMarks(6, [
        { name: 'A', count: 3 },
        { name: 'B', count: 3 },
      ]),
    ).toEqual({ count: 6, sectors: ['A', 'B'] });
  });
});
