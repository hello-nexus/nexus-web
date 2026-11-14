import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelDevicePatch, PanelDeviceRecord } from '../../api/panel';

// A stateful stand-in for the service: PATCH merges into the stored record (an empty string clears a field), every write publishes the panel/device frame, GET returns the stored record.
const store = vi.hoisted(() => ({ record: {} as Record<string, unknown>, patches: [] as Record<string, unknown>[], topics: new Set<(raw: unknown) => void>(), latency: [5, 25] as number[], n: 0, inflight: 0 }));
const publish = () => store.topics.forEach(cb => cb({ deviceId: 'dev1' }));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

vi.mock('../../api/panel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/panel')>();
  return {
    ...actual,
    fetchPanelDeviceWithStatus: vi.fn(async () => {
      store.inflight++;
      await wait(5);
      store.inflight--;
      return { found: true, record: actual.canonicalPanelRecord({ ...store.record } as PanelDeviceRecord) };
    }),
    patchPanelDevice: vi.fn(async (_id: string, patch: PanelDevicePatch) => {
      store.patches.push({ ...patch });
      store.inflight++;
      await wait(store.latency[store.n++ % store.latency.length]);
      for (const [key, value] of Object.entries(patch)) store.record[key] = value === '' ? null : value;
      publish();
      store.inflight--;
      return { ...store.record } as PanelDeviceRecord;
    }),
  };
});
vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, _enabled: boolean, cb: (raw: unknown) => void) => {
    if (topic === 'panel/device') store.topics.add(cb);
  },
}));
vi.mock('../../api/profiles', () => ({ fetchPreferences: vi.fn(async () => ({ panel: {}, theme: {} })) }));
vi.mock('../../hooks/useAnimateTemplates', () => ({ useAnimateTemplates: () => ({ templates: {} }) }));
vi.mock('../../api/lighting', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/lighting')>()), saveAnimateTemplates: vi.fn(async () => {}) }));
vi.mock('../engine/panelSync', () => ({ broadcastLayoutChanged: vi.fn(), onLayoutChanged: () => () => {} }));

import { usePanelRecord } from '../engine/usePanelRecord';
import { usePanelTheme } from './panelTheme';

const AURORA = { backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundTemplate: 2, backgroundTemplates: { aurora: 2, fire: 1 }, backgroundFrostLevel: 30, backgroundOpacity: 0.4, backdrop: 'theme' };

beforeEach(() => {
  store.record = { id: 'dev1', displayName: 'Y70', capabilities: { surface: 'y70', touch: true }, ...AURORA };
  store.patches = [];
  store.topics.clear();
  store.latency = [5];
  store.n = 0;
  store.inflight = 0;
});

function mount() {
  return renderHook(() => {
    const recordState = usePanelRecord('dev1');
    return { panelTheme: usePanelTheme(recordState, 'dev1'), recordState };
  });
}

type Hook = ReturnType<typeof mount>['result'];
async function run(result: Hook, fn: (t: Hook['current']['panelTheme']) => void) {
  const sent = store.patches.length;
  act(() => fn(result.current.panelTheme));
  await waitFor(() => {
    expect(store.patches.length).toBeGreaterThan(sent);
    expect(store.inflight).toBe(0);
  });
}

describe('per-skin background through usePanelTheme and the record', () => {
  it('aurora -> Neon -> Neon set to Solid -> LCD -> Neon -> none restores aurora with its preset', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.panelTheme.theme.backgroundEffect).toBe('aurora'));

    await run(result, t => t.commitSkin('neon'));
    expect(result.current.panelTheme.theme).toMatchObject({ skin: 'neon', backgroundMode: 'skin', backgroundFrost: 0, backgroundOpacity: 1 });
    await run(result, t => t.commitBackgroundMode('solid'));
    expect(store.record.skinOverrides).toEqual({ neon: { backgroundMode: 'solid' } });
    expect(result.current.panelTheme.theme).toMatchObject({ backgroundMode: 'solid', backgroundFrost: 30, backgroundOpacity: 0.4 });
    await run(result, t => t.commitSkin('lcd'));
    expect(result.current.panelTheme.theme).toMatchObject({ skin: 'lcd', backgroundMode: 'skin' });
    await run(result, t => t.commitSkin('neon'));
    expect(result.current.panelTheme.theme).toMatchObject({ skin: 'neon', backgroundMode: 'solid', backgroundModeBefore: 'shader' });
    await run(result, t => t.commitSkin(null));

    expect(store.record).toMatchObject({ skin: null, ...AURORA });
    expect(result.current.panelTheme.theme).toMatchObject({
      skin: null, backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundTemplate: 2, backgroundFrost: 30, backgroundOpacity: 0.4, backgroundHeld: null,
    });
  });

  it('Solid -> Sketch (remembers Animations fire) -> none restores Solid and its effect', async () => {
    store.record = { ...store.record, backgroundMode: 'solid', backgroundEffect: 'plasma', skinOverrides: { sketch: { backgroundMode: 'shader', backgroundEffect: 'fire' } } };
    const { result } = mount();
    await waitFor(() => expect(result.current.panelTheme.theme.skinOverrides.sketch).toBeDefined());

    await run(result, t => t.commitSkin('sketch'));
    expect(result.current.panelTheme.theme).toMatchObject({ skin: 'sketch', backgroundMode: 'shader', backgroundEffect: 'fire', backgroundTemplate: 1 });
    await run(result, t => t.commitBackgroundEffect('aurora'));
    expect(store.record.skinOverrides).toEqual({ sketch: { backgroundMode: 'shader', backgroundEffect: 'aurora' } });
    await run(result, t => t.commitSkin(null));

    expect(store.record).toMatchObject({ skin: null, backgroundMode: 'solid', backgroundEffect: 'plasma', backgroundFrostLevel: 30, backgroundOpacity: 0.4 });
    expect(result.current.panelTheme.theme).toMatchObject({ skin: null, backgroundMode: 'solid', backgroundEffect: 'plasma' });
  });
});
