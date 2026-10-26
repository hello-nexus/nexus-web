// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DisplayTopology, TopologyDisplay } from '../../api/displays';
import type { PanelDeviceRecord } from '../../api/panel';
import { displayTargetsOf } from './useDisplayTargets';

const rec = (over: Partial<PanelDeviceRecord>): PanelDeviceRecord =>
  ({ id: 'r', displayName: 'Display', firstSeenAt: 0, lastSeenAt: 0, displayId: 'd', capabilities: { surface: 'monitor' }, ...over });
const disp = (over: Partial<TopologyDisplay>): TopologyDisplay => ({
  id: 'd', number: 1, name: 'Monitor', manufacturer: '', model: '', bounds: null, resolution: { width: 1, height: 1 },
  scaleFactor: null, dpi: null, isPrimary: false, isInternal: false, isTouch: false, orientation: '', isY70: false,
  ddcEnabled: true, hostingSupported: true, assignedPanelDeviceId: null, assignedPanelName: null, ...over,
});
const topo = (displays: TopologyDisplay[], hostingSupported = true): DisplayTopology =>
  ({ hostingSupported, rotationSupported: false, reserveSupported: false, positionsAvailable: true, revision: 1, displays, hint: '' });

describe('displayTargetsOf', () => {
  it('lists panels that are on and displays that can become one', () => {
    const list = displayTargetsOf(topo([
      disp({ id: 'a', assignedPanelDeviceId: 'ra' }),
      disp({ id: 'b', assignedPanelDeviceId: 'rb' }),
      disp({ id: 'c', assignedPanelDeviceId: 'rc' }),
      disp({ id: 'y', isY70: true }),
      disp({ id: 'e', name: 'Plain' }),
      disp({ id: 'f', hostingSupported: false }),
    ]), [
      rec({ id: 'ra', displayName: 'Left' }),
      rec({ id: 'rb', enabled: false }),
      rec({ id: 'rc', capabilities: { surface: 'q60' } }),
    ], null);
    expect(list).toEqual([{ id: 'a', name: 'Left' }, { id: 'e', name: 'Plain' }]);
  });

  it('offers nothing before the topology loads or when the host cannot run panels', () => {
    expect(displayTargetsOf(null, [], null)).toEqual([]);
    expect(displayTargetsOf(topo([disp({ id: 'e' })], false), [], null)).toEqual([]);
  });

  it('puts the display the window is on first', () => {
    const list = displayTargetsOf(topo([disp({ id: 'a', name: 'A' }), disp({ id: 'b', name: 'B' }), disp({ id: 'c', name: 'C' })]), [], 'b');
    expect(list.map(t => t.id)).toEqual(['b', 'a', 'c']);
  });
});
