/**
 * Geliştirmede URL ve sunucu eylemi girdileri jeton veya kişisel veri taşıyabilir; kodlanmış
 * ve iç içe parametreler güvenilir biçimde ayıklanamadığından iki istek günlüğü de kapalıdır.
 * Uygulamanın maskeli, açıkça yazdığı hata ve iş günlükleri bu ayardan etkilenmez.
 */
export const nextLogging = {
  serverFunctions: false,
  incomingRequests: false,
} as const;
