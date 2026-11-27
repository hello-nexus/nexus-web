import { useEffect, useMemo, useState } from 'react';
import { usePanelDevices } from '../../../hooks/usePanelDevices';
import { fetchPanelPresets, type PanelPreset } from '../../../api/panel';
import type { PanelDevice } from '../../device/panelDevices';

export interface DisplayPresetTarget {
  /** The panel record id the presets route is keyed by. */
  deviceId: string;
  name: string;
  presets: { id: string; name: string }[];
}

/** Displays that own a panel record and at least one saved preset. */
export function buildDisplayPresetTargets(
  devices: readonly Pick<PanelDevice, 'name' | 'panelRecordId'>[],
  presetsByRecord: Readonly<Record<string, readonly Pick<PanelPreset, 'id' | 'name'>[]>>,
): DisplayPresetTarget[] {
  const out: DisplayPresetTarget[] = [];
  const seen = new Set<string>();
  for (const device of devices) {
    const id = device.panelRecordId;
    if (!id || seen.has(id)) continue;
    const presets = presetsByRecord[id] ?? [];
    if (presets.length === 0) continue;
    seen.add(id);
    out.push({ deviceId: id, name: device.name, presets: presets.map(p => ({ id: p.id, name: p.name })) });
  }
  return out;
}

/** Same lists the display device page's preset dropdown shows, one fetch per panel record. */
export function useDisplayPresetTargets(): { targets: DisplayPresetTarget[]; loaded: boolean } {
  const { devices, loading } = usePanelDevices(true);
  const recordIds = useMemo(
    () => devices.map(d => d.panelRecordId).filter((id): id is string => !!id),
    [devices],
  );
  const recordKey = recordIds.join('|');
  const [presetsByRecord, setPresetsByRecord] = useState<Record<string, PanelPreset[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(recordIds.map(id => fetchPanelPresets(id).then(res => [id, res?.presets ?? []] as const)))
      .then(entries => {
        if (cancelled) return;
        setPresetsByRecord(Object.fromEntries(entries));
        setLoadedKey(recordKey);
      });
    return () => { cancelled = true; };
    // recordKey stands for recordIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  const targets = useMemo(() => buildDisplayPresetTargets(devices, presetsByRecord), [devices, presetsByRecord]);
  return { targets, loaded: !loading && loadedKey === recordKey };
}
