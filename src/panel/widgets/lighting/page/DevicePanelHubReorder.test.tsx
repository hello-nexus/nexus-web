import { act, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DndContext } from '@dnd-kit/core';
import { DevicePanel } from './DevicePanel';
import type { LightingDevice } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    language: 'en',
  }),
}));

// jsdom has no layout for dnd-kit's collision detection, so the test drives each
// list's own drag handlers; the outer rail list renders first, the hub's inner list after.
const dnd = vi.hoisted(() => ({ all: [] as ComponentProps<typeof DndContext>[] }));
vi.mock('@dnd-kit/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.all.push(props);
      return <actual.DndContext {...props} />;
    },
  };
});

const port = (n: number, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id: `corsair:ch${n}:z0`, name: `iCUE LINK QX RGB (Port ${n})`, ledsOn: true, ledCount: 34,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  parentDeviceId: 'corsair', parentName: 'Corsair iCUE LINK Hub', zoneIndex: n, deviceId: `corsair:ch${n}`,
  ...extra,
});

function renderRail(devices: LightingDevice[], onDeviceReorder = vi.fn(), stacks: { id: string; name: string; members: string[] }[] = []) {
  dnd.all.length = 0;
  render(
    <DevicePanel
      devices={devices}
      selectedIds={new Set()}
      onSetSelection={() => {}}
      onTogglePower={() => {}}
      onSetPower={() => {}}
      onToggleControlled={() => {}}
      onSetControlled={() => {}}
      lightingOff={false}
      onOpenSettings={() => {}}
      onDeviceReorder={onDeviceReorder}
      stacks={stacks as never}
      onStacksChange={() => {}}
    />,
  );
  return onDeviceReorder;
}

// The latest render of the hub's inner list: the last DndContext mounted.
const innerList = () => dnd.all[dnd.all.length - 1];
const move = (active: string, over: string) => act(() => {
  const list = innerList();
  list.onDragStart!({ active: { id: active } } as never);
  list.onDragEnd!({ active: { id: active }, over: { id: over } } as never);
});

describe('DevicePanel hub group reorder', () => {
  const ports = [port(14), port(15), port(16)];

  it('reorders ports inside the hub group and reports the flat order', () => {
    const onReorder = renderRail(ports);
    move('corsair:ch16:z0', 'corsair:ch14:z0');
    expect(onReorder).toHaveBeenCalledWith(['corsair:ch16:z0', 'corsair:ch14:z0', 'corsair:ch15:z0']);
  });

  it('reorders a stacked port the same way', () => {
    const onReorder = renderRail(ports, vi.fn(), [{ id: 's1', name: '', members: ['corsair:ch14:z0', 'corsair:ch15:z0'] }]);
    move('corsair:ch14:z0', 'corsair:ch16:z0');
    expect(onReorder).toHaveBeenCalledWith(['corsair:ch15:z0', 'corsair:ch16:z0', 'corsair:ch14:z0']);
  });

  it('keeps a port inside its hub when dropped over a card outside it', () => {
    const outside = { ...port(1), id: 'strip', name: 'Strip', parentDeviceId: undefined, zoneIndex: undefined, deviceId: 'strip' };
    const onReorder = renderRail([outside, ...ports]);
    move('corsair:ch14:z0', 'strip');
    const calls = onReorder.mock.calls;
    // Either nothing was reported, or the strip stayed first and the hub's ports stayed together.
    if (calls.length > 0) {
      expect(calls.at(-1)?.[0]).toEqual(['strip', 'corsair:ch14:z0', 'corsair:ch15:z0', 'corsair:ch16:z0']);
    }
  });
});
