import { useCallback, useEffect, useState } from 'react';
import { fetchPanelDevices, type PanelDeviceRecord } from '../../api/panel';
import { commitPlacement, type PlacementTarget } from '../../components/views/StorePage/installPlacement';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { lookupApp } from '../widgets/registry';

export interface DisplayTarget { id: string; name: string }

/** Display panels that are on and lay out several widgets: where the dashboard can add a widget. */
export function displayTargetsOf(records: readonly PanelDeviceRecord[]): DisplayTarget[] {
  return records
    .filter(r => r.displayId && r.enabled !== false && r.capabilities?.surface === 'monitor')
    .map(r => ({ id: r.id, name: r.displayName }));
}

export function useDisplayTargets(enabled: boolean) {
  const [records, setRecords] = useState<PanelDeviceRecord[]>([]);
  const load = useCallback(() => {
    void fetchPanelDevices().then(list => setRecords(list?.devices ?? []));
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  useTopicCallback('panel/device', enabled, load);

  const addToDisplay = useCallback(async (displayId: string, type: string): Promise<boolean> => {
    const record = records.find(r => r.id === displayId);
    const meta = lookupApp(type)?.meta;
    if (!record || !meta) return false;
    const target: PlacementTarget = {
      key: `display:${record.id}`,
      name: record.displayName,
      iconSrc: null,
      surface: 'monitor',
      panelRecordId: record.id,
      family: record.capabilities?.family,
      deviceTouch: record.capabilities?.touch,
    };
    return commitPlacement(target, type, meta, 0);
  }, [records]);

  return { targets: displayTargetsOf(records), addToDisplay };
}
