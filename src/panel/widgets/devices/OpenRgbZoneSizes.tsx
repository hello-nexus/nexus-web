import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Notice } from '../../../components/common/Notice/Notice';
import { Slider } from '../../../components/common/Slider/Slider';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import type { OpenRgbZoneDevice } from '../../../api/openRgbZones';
import { clampZoneCount, deviceNeedsSize, resizableZones } from './zoneSizeUtils';
import styles from './DevicesPage.module.scss';

/**
 * The one place to set the LED count of an OpenRGB device's configurable-size
 * zones (fan and strip headers), mirroring vanilla OpenRGB's zone resize. Every
 * change applies on release or on a typed edit; there is no save step.
 * A device with an unsized zone opens expanded under a prompt.
 */
export function OpenRgbZoneSizes({
  device,
  onSetSize,
}: {
  device: OpenRgbZoneDevice;
  /** Resolves false when the service refused the size. */
  onSetSize: (deviceId: string, zoneIndex: number, ledCount: number) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const needsSize = deviceNeedsSize(device);
  const zones = resizableZones(device);
  const [open, setOpen] = useState(needsSize);
  // Counts the user is moving, by zone index; the stored value shows again once the write settles.
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [failed, setFailed] = useState(false);

  if (zones.length === 0) return null;

  const commit = (index: number, count: number) => {
    setFailed(false);
    void onSetSize(device.deviceId, index, count).then(ok => {
      if (!ok) setFailed(true);
      setDraft(prev => {
        const rest = { ...prev };
        delete rest[index];
        return rest;
      });
    });
  };

  return (
    <div className={styles.zoneSizes}>
      {needsSize && <Notice tone="info" role="status">{t('devices.openrgb.zoneSizePrompt')}</Notice>}
      {failed && <Notice tone="warning" role="alert">{t('devices.openrgb.zoneSizeFailed')}</Notice>}
      <CollapsibleSection
        compact
        title={t('devices.openrgb.zoneSizes')}
        open={open}
        onToggle={() => setOpen(o => !o)}
        ariaLabel={t('devices.openrgb.zoneSizesToggle', { name: device.name })}
      >
        <div className={styles.zoneSizeList}>
          {zones.map(zone => {
            const value = clampZoneCount(zone, draft[zone.index] ?? zone.ledCount);
            return (
              <Slider
                key={zone.index}
                orientation="stacked"
                editable
                trackFill
                label={zone.name}
                value={value}
                min={zone.ledsMin}
                max={zone.ledsMax}
                onChange={v => setDraft(prev => ({ ...prev, [zone.index]: clampZoneCount(zone, v) }))}
                onCommit={v => commit(zone.index, clampZoneCount(zone, v))}
              />
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
