import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

/** Yönetim de oturum + rıza kapısının içinde (tur bulgusu #11); eylemler ayrıca sunucuda kontrol eder. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
