import { QrEntry } from '@/components/campus-events/qr-entry';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default function CampusEventQrEntryPage() {
  return <QrEntry />;
}
