import { describe, expect, it } from 'vitest';
import { groupGuideCourses } from './group-courses';

describe('ders rehberi gruplaması', () => {
  it('eşik üstü kartları öne alır, diğerlerini yarıyıla ayırır; kurum ve kaynak sırasını korur', () => {
    const courses = [
      { code: 'ORTAK', semester: 2, count: null, name: 'Ortak ders' },
      { code: 'YBSB03', semester: 3, count: null, name: 'Üçüncü yarıyıl' },
      { code: 'YBSB11', semester: 1, count: null, name: 'İlk sıra' },
      { code: 'YBSB12', semester: 1, count: null, name: 'İkinci sıra' },
      { code: 'YBSB22', semester: 2, count: 3, name: 'Görünen değerlendirme' },
      { code: 'ORTAK2', semester: 1, count: 4, name: 'Ortak değerlendirme' },
    ];
    const [department, common] = groupGuideCourses(courses);
    expect(department!.reviewed.map((course) => course.code)).toEqual(['YBSB22']);
    expect(department!.semesters.map((group) => group.semester)).toEqual([1, 3]);
    expect(department!.semesters[0]!.courses.map((course) => course.code)).toEqual([
      'YBSB11',
      'YBSB12',
    ]);
    expect(common!.reviewed.map((course) => course.code)).toEqual(['ORTAK2']);
    expect(common!.semesters[0]!.courses[0]!.code).toBe('ORTAK');
    expect(courses[0]!.code).toBe('ORTAK');
  });
  it('null sayıyı görünür sayıya çevirmeden korur; boş gruplar oluşturmaz', () => {
    const [department, common] = groupGuideCourses([{ code: 'YBSB01', semester: 0, count: null }]);
    expect(department!.reviewed).toEqual([]);
    expect(department!.semesters).toEqual([
      { semester: 0, courses: [{ code: 'YBSB01', semester: 0, count: null }] },
    ]);
    expect(common!.reviewed).toEqual([]);
    expect(common!.semesters).toEqual([]);
  });
});
