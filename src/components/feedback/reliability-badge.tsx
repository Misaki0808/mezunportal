import { Badge } from '@/components/ui';
import type { Reliability } from '@/server/rules/reliability';
export function ReliabilityBadge({ label, text }: { label: Reliability['label']; text: string }) {
  const tone = label === 'RELIABLE' ? 'success' : label === 'CAUTION' ? 'warning' : 'neutral';
  return (
    <Badge className="text-base" tone={tone}>
      {text}
    </Badge>
  );
}
