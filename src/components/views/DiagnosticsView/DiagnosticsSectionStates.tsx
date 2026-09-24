import { MonitorOff, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';

/** A section's endpoint reported `supported: false` - the host platform (or
 *  this specific hardware) doesn't expose this data. Shared by every
 *  section so the "not available" treatment reads identically everywhere. */
export function NotAvailableNote() {
  const { t } = useTranslation();
  return (
    <EmptyState compact icon={<MonitorOff size={22} />} title={t('diagnostics.notAvailable')} />
  );
}

/** A section's fetch failed with no prior data to fall back to: an
 *  EmptyState with a retry action, so every section's error state reads
 *  identically. */
export function SectionLoadError({ onRetry, loading }: { onRetry: () => void; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      compact
      icon={<TriangleAlert size={22} />}
      title={t('diagnostics.loadFailed')}
      action={<Button size="sm" loading={loading} onClick={onRetry}>{t('diagnostics.retry')}</Button>}
    />
  );
}
