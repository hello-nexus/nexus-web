// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PanelDeviceRecord } from '../../api/panel';
import { displayTargetsOf } from './useDisplayTargets';

const rec = (over: Partial<PanelDeviceRecord>): PanelDeviceRecord =>
  ({ id: 'r', displayName: 'Display', firstSeenAt: 0, lastSeenAt: 0, displayId: 'd', capabilities: { surface: 'monitor' }, ...over });

describe('displayTargetsOf', () => {
  it('lists display-bound monitor panels that are on', () => {
    const list = displayTargetsOf([
      rec({ id: 'a', displayName: 'Left' }),
      rec({ id: 'b', enabled: false }),
      rec({ id: 'c', displayId: undefined }),
      rec({ id: 'd', capabilities: { surface: 'q60' } }),
      rec({ id: 'e', displayName: 'Right', enabled: null }),
    ]);
    expect(list).toEqual([{ id: 'a', name: 'Left' }, { id: 'e', name: 'Right' }]);
  });
});
