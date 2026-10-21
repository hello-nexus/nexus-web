import { useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Notice } from '../../../components/common/Notice/Notice';
import { Slider } from '../../../components/common/Slider/Slider';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import type { OpenRgbZoneDevice } from '../../../api/openRgbZones';
import { clampZoneCount, deviceNeedsSize, resizableZones } from './zoneSizeUtils';
import styles from './DevicesPage.module.scss';

interface Draft {
  count: number;
  token: number;
}

/**
 * The LED count of an OpenRGB device's configurable-size zones (fan and strip
 * headers). A change applies on release or on a typed edit; there is no save
 * step. A device with an unsized zone opens expanded under a prompt.
 */
export function OpenRgbZoneSizes({
  device,
  onSetSize,
  onFailed,
}: {
  device: OpenRgbZoneDevice;
  /** Resolves false when the service refused the size, and only once the stored count has caught up. */
  onSetSize: (deviceId: string, zoneIndex: number, ledCount: number) => Promise<boolean>;
  onFailed?: () => void;
}) {
  const { t } = useTranslation();
  const needsSize = deviceNeedsSize(device);
  const zones = resizableZones(device);
  const [open, setOpen] = useState(needsSize);
  // The count a zone shows while its write is in flight, by zone index.
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const nextToken = useRef(0);
  // What the slider showed when this gesture began; a release at the same value is not a change.
  const gestureStart = useRef<Record<number, { value: number; draft: Draft | undefined }>>({});
  const typed = useRef<Set<number>>(new Set());
  const pointered = useRef<Set<number>>(new Set());

  if (zones.length === 0) return null;

  const commit = (index: number, count: number) => {
    const token = ++nextToken.current;
    setDrafts(prev => ({ ...prev, [index]: { count, token } }));
    void onSetSize(device.deviceId, index, count).then(ok => {
      if (!ok) onFailed?.();
      // A newer write to the same zone owns the draft now.
      setDrafts(prev => {
        if (prev[index]?.token !== token) return prev;
        const rest = { ...prev };
        delete rest[index];
        return rest;
      });
    });
  };

  return (
    <div className={styles.zoneSizes}>
      {needsSize && <Notice tone="info" role="status">{t('devices.openrgb.zoneSizePrompt')}</Notice>}
      <CollapsibleSection
        compact
        title={t('devices.openrgb.zoneSizes')}
        open={open}
        onToggle={() => setOpen(o => !o)}
        ariaLabel={t('devices.openrgb.zoneSizesToggle', { name: device.name })}
      >
        <div className={styles.zoneSizeList}>
          {zones.map(zone => {
            const draft = drafts[zone.index];
            const value = clampZoneCount(zone, draft?.count ?? zone.ledCount);
            // An unsized zone's count is a placeholder, so it reads as unset until the user confirms one.
            const unset = zone.needsSize && draft === undefined;
            return (
              // Enter on the focused slider confirms the count an unsized zone shows.
              <div
                key={zone.index}
                onKeyDown={e => {
                  if (unset && e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'range') {
                    e.preventDefault();
                    commit(zone.index, value);
                  }
                }}
              >
              <Slider
                orientation="inline"
                editable
                trackFill
                label={zone.name}
                value={value}
                min={zone.ledsMin}
                max={zone.ledsMax}
                mixed={unset}
                mixedLabel={String(value)}
                valueText={unset ? t('devices.openrgb.zoneUnset', { value }) : undefined}
                onPointerDown={e => { if (e.button === 0) pointered.current.add(zone.index); }}
                onPointerCancel={() => { pointered.current.delete(zone.index); }}
                onChange={(v, typedEdit) => {
                  if (gestureStart.current[zone.index] === undefined) gestureStart.current[zone.index] = { value, draft };
                  if (typedEdit) typed.current.add(zone.index);
                  setDrafts(prev => ({ ...prev, [zone.index]: { count: clampZoneCount(zone, v), token: ++nextToken.current } }));
                }}
                onCommit={v => {
                  const start = gestureStart.current[zone.index];
                  const wasTyped = typed.current.delete(zone.index);
                  const wasPointer = pointered.current.delete(zone.index);
                  delete gestureStart.current[zone.index];
                  const count = clampZoneCount(zone, v);
                  // A release on an unsized zone confirms the count it shows; a key press alone does not.
                  const confirm = wasTyped || (zone.needsSize && wasPointer);
                  if (confirm || (start !== undefined && start.value !== count)) {
                    commit(zone.index, count);
                  } else if (start !== undefined) {
                    setDrafts(prev => {
                      const rest = { ...prev };
                      if (start.draft) rest[zone.index] = start.draft;
                      else delete rest[zone.index];
                      return rest;
                    });
                  }
                }}
              />
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
