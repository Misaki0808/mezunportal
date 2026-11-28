/**
 * Başlığı olmayan deneyimin yedek başlığı: "Günlük hayat" türünde konu isteğe bağlıdır, başlıksız kalırsa tür adı gösterilir
 * (kart 572); diğer türlerde "Başlıksız taslak".
 */
export const untitledKey = (type: string) =>
  type === 'DAILY_LIFE' ? ('types.DAILY_LIFE' as const) : ('mine.untitled' as const);
