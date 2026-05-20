import { type LightingDevice } from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import { ZoneCard } from './ZoneCard';
import { MotherboardGroup } from './MotherboardGroup';
import styles from '../LightingView.module.scss';

/**
 * Right-side sidebar listing detected RGB devices. Flags devices whose OpenRGB
 * detector failed (ledCount = 0) so the user can see the device is detected
 * but not drivable. Motherboards with more than one ARGB header are grouped
 * under a collapsible header; each zone renders as its own card so the user
 * can configure + control each physical strip independently.
 */
export function DevicePanel({ devices, selectedDeviceId, onSelectDevice, onTogglePower, lightingOff, onOpenSettings }: {
  devices: LightingDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  onTogglePower: (id: string) => void;
  /** Whether the lighting mode is 'none' (off). Swaps the empty message. */
  lightingOff: boolean;
  onOpenSettings: (id: string) => void;
}) {
  const { t } = useTranslation();

  // Group devices so motherboard zones show as children under a single parent
  // header. Non-zone devices are rendered as flat top-level cards.
  const groups: Array<
    | { kind: 'single'; device: LightingDevice }
    | { kind: 'motherboard'; parentId: string; parentName: string; zones: LightingDevice[] }
  > = [];
  const motherboardIndex = new Map<string, number>();
  for (const d of devices) {
    if (d.parentDeviceId && d.zoneIndex != null) {
      const existing = motherboardIndex.get(d.parentDeviceId);
      if (existing != null) {
        const g = groups[existing];
        if (g.kind === 'motherboard') g.zones.push(d);
      } else {
        const parentName = deriveParentName(d);
        motherboardIndex.set(d.parentDeviceId, groups.length);
        groups.push({ kind: 'motherboard', parentId: d.parentDeviceId, parentName, zones: [d] });
      }
    } else {
      groups.push({ kind: 'single', device: d });
    }
  }

  return (
    <aside className={styles.devicePanel}>
      {devices.length === 0 ? (
        <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
      ) : (
        <div className={styles.deviceList}>
          {groups.map((g, i) => {
            if (g.kind === 'single') {
              const d = g.device;
              return (
                <ZoneCard
                  key={d.id}
                  device={d}
                  selected={d.id === selectedDeviceId}
                  indent={false}
                  onSelect={() => onSelectDevice(d.id === selectedDeviceId ? null : d.id)}
                  onTogglePower={() => onTogglePower(d.id)}
                  onOpenSettings={() => onOpenSettings(d.id)}
                />
              );
            }
            return (
              <MotherboardGroup key={g.parentId + '-' + i} parentName={g.parentName}>
                {g.zones.map(z => (
                  <ZoneCard
                    key={z.id}
                    device={z}
                    displayName={stripParentPrefix(z.name, g.parentName)}
                    selected={z.id === selectedDeviceId}
                    indent={true}
                    onSelect={() => onSelectDevice(z.id === selectedDeviceId ? null : z.id)}
                    onTogglePower={() => onTogglePower(z.id)}
                    onOpenSettings={() => onOpenSettings(z.id)}
                  />
                ))}
              </MotherboardGroup>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// Zone names come in as "{Motherboard Name} - {Zone Name}". The parent header
// only needs the motherboard part. Fall back to the zone name if the service
// didn't use the separator convention.
function deriveParentName(zone: LightingDevice): string {
  const dash = zone.name.indexOf(' - ');
  if (dash > 0) return zone.name.slice(0, dash);
  return zone.name;
}

// Strip the parent name (plus a separator) off the front of a child zone's
// name so the child card shows just the zone-specific part. Falls back to the
// original name if it doesn't actually start with the parent prefix.
function stripParentPrefix(name: string, parentName: string): string {
  if (!parentName) return name;
  for (const sep of [' - ', ': ', ' ']) {
    const prefix = parentName + sep;
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length).trim();
      if (rest) return rest;
    }
  }
  return name;
}
