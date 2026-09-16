import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../common/Button/Button';

interface IgnoreToggleProps {
  ignored: boolean;
  onToggle: () => void;
  /** Icon-only, for dense rows; the label moves to the tooltip. */
  compact?: boolean;
}

/** Ignore / Include button a diagnostics device card or row carries. */
export function IgnoreToggle({ ignored, onToggle, compact = false }: IgnoreToggleProps) {
  const { t } = useTranslation();
  const label = t(ignored ? 'diagnostics.ignore.include' : 'diagnostics.ignore.ignore');
  return (
    <Button
      size="sm"
      tone="neutral"
      icon={ignored ? <Eye size={13} /> : <EyeOff size={13} />}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      onClick={onToggle}
    >
      {compact ? undefined : label}
    </Button>
  );
}
