import type { AdminOverview } from '@/contracts/admin';

/**
 * Yönetim yolunun ikinci parçası → gereken yetenek. Haritada olmayan yol varsayılan 'users' izniyle (bölüm yöneticisi dahil)
 * geçer. Yerleşim (404'ü başlatan) ve 404 ekranı (hangi metnin gösterileceğine karar veren) aynı haritayı kullanır; ikisi
 * ayrışırsa gerçek rol reddi "bulunamadı" gibi görünür.
 */
const CAPABILITIES: Record<string, keyof AdminOverview['capabilities']> = {
  sozlukler: 'dictionaries',
  eslesmeyenler: 'unmatchedValues',
  yetkiler: 'adminGrants',
  // Yalnız sistem yöneticisi: haritada olmayan yol varsayılan 'users' izniyle (bölüm yöneticisi dahil) geçer ve
  // sayfa içi ret 200 döner; 404 yalnız buradan gelir.
  puan: 'adminGrants',
  davetler: 'dictionaries',
  'islem-kaydi': 'auditLog',
  istihdam: 'employmentReport',
  sikayetler: 'reports',
};

export function adminCapabilityFor(
  segment: string | undefined,
): keyof AdminOverview['capabilities'] {
  return CAPABILITIES[segment ?? ''] ?? 'users';
}
