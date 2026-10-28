import { HardDriveDownload } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../Badge/Badge';
import { RowGlyph } from '../RowGlyph/RowGlyph';

/**
 * Shown when the device has a firmware or panel-app update: a row glyph, or
 * with `chip` a labelled pill (the Devices list).
 */
export function DeviceUpdateIcon({ className, chip, onActivate }: { className?: string; chip?: boolean; onActivate?: () => void }) {
  const { t } = useTranslation();
  const where = t('devices.firmwareUpdate.tooltip');
  if (chip) {
    return (
      <Badge
        label={t('devices.firmware.status.updateAvailable')}
        color="var(--accent)"
        icon={<HardDriveDownload size={12} aria-hidden />}
        tooltip={{ body: where }}
        className={className}
      />
    );
  }
  return <RowGlyph icon={<HardDriveDownload size={14} aria-hidden />} label={where} tone="accent" className={className} onActivate={onActivate} />;
}
