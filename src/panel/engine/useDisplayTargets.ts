import { useCallback, useEffect, useState } from 'react';
import { promoteDisplayToPanel, type DisplayTopology } from '../../api/displays';
import { fetchPanelDevices, type PanelDeviceRecord } from '../../api/panel';
import { commitPlacement, type PlacementTarget } from '../../components/views/StorePage/installPlacement';
import { useDisplayTopology } from '../../hooks/useDisplayTopology';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import type { PanelWidget } from '../types';
import { lookupApp } from '../widgets/registry';
import { displayIdForWindow } from './windowDisplay';

export interface DisplayTarget { id: string; name: string }

/**
 * Where the dashboard can add a widget: displays hosting a multi-widget panel that is on, plus every
 * display that could host one (added after turning it into a panel). The window's display comes first.
 */
export function displayTargetsOf(
  topology: DisplayTopology | null,
  records: readonly PanelDeviceRecord[],
  currentDisplayId: string | null,
): DisplayTarget[] {
  if (!topology) return [];
  const targets: DisplayTarget[] = [];
  for (const d of topology.displays) {
    if (d.isY70) continue;
    if (d.assignedPanelDeviceId) {
      const r = records.find(rec => rec.id === d.assignedPanelDeviceId);
      if (r && r.enabled !== false && r.capabilities?.surface === 'monitor') targets.push({ id: d.id, name: r.displayName });
    } else if (topology.hostingSupported && d.hostingSupported) {
      targets.push({ id: d.id, name: d.name });
    }
  }
  const current = targets.findIndex(t => t.id === currentDisplayId);
  return current > 0 ? [targets[current], ...targets.slice(0, current), ...targets.slice(current + 1)] : targets;
}

export function useDisplayTargets(enabled: boolean) {
  const { topology } = useDisplayTopology(enabled);
  const [records, setRecords] = useState<PanelDeviceRecord[]>([]);
  const load = useCallback(() => {
    void fetchPanelDevices().then(list => setRecords(list?.devices ?? []));
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  useTopicCallback('panel/device', enabled, load);

  const addToDisplay = useCallback(async (displayId: string, widget: Pick<PanelWidget, 'type' | 'size' | 'config'>): Promise<boolean> => {
    const display = topology?.displays.find(d => d.id === displayId);
    const meta = lookupApp(widget.type)?.meta;
    if (!display || !meta) return false;
    const record = display.assignedPanelDeviceId
      ? records.find(r => r.id === display.assignedPanelDeviceId)
      : await promoteDisplayToPanel(display.id);
    if (!record) return false;
    const target: PlacementTarget = {
      key: `display:${record.id}`,
      name: record.displayName,
      iconSrc: null,
      surface: 'monitor',
      panelRecordId: record.id,
      family: record.capabilities?.family,
      deviceTouch: record.capabilities?.touch,
    };
    return commitPlacement(target, widget.type, meta, 0, { size: widget.size, config: widget.config });
  }, [records, topology]);

  const currentDisplayId = topology ? displayIdForWindow(topology.displays, window) : null;
  return { targets: displayTargetsOf(topology, records, currentDisplayId), addToDisplay };
}
