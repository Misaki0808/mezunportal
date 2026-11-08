/** Son 12 ayın kesinleşmiş sonuçları; iptal ve bekleyen görüşmeler paydada değildir. */
export type Reliability = {
  label: 'NEW' | 'RELIABLE' | 'CAUTION';
  total: number;
  completed: number;
  noShow: number;
};
export function reliability(completed: number, noShow: number): Reliability {
  if (!Number.isInteger(completed) || !Number.isInteger(noShow) || completed < 0 || noShow < 0)
    throw new RangeError('invalid counts');
  const total = completed + noShow;
  return {
    label: total < 3 ? 'NEW' : completed * 100 >= total * 80 ? 'RELIABLE' : 'CAUTION',
    total,
    completed,
    noShow,
  };
}
/** 12 ay, takvim ayı olarak hesaplanır. */
export function reliabilitySince(now: Date): Date {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  return since;
}
