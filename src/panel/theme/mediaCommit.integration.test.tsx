import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelDevicePatch, PanelDeviceRecord } from '../../api/panel';

// A stateful stand-in for the service: PATCH merges into the stored record (an empty string clears a field), every write publishes the panel/device frame, GET returns the stored record.
const store = vi.hoisted(() => ({ record: {} as Record<string, unknown>, patches: [] as Record<string, unknown>[], topics: new Set<(raw: unknown) => void>(), latency: [5, 25] as number[], n: 0 }));
const publish = () => store.topics.forEach(cb => cb({ deviceId: 'dev1' }));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

vi.mock('../../api/panel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/panel')>();
  return {
    ...actual,
    fetchPanelDeviceWithStatus: vi.fn(async () => {
      await wait(5);
      return { found: true, record: actual.canonicalPanelRecord({ ...store.record } as PanelDeviceRecord) };
    }),
    patchPanelDevice: vi.fn(async (_id: string, patch: PanelDevicePatch) => {
      store.patches.push({ ...patch });
      await wait(store.latency[store.n++ % store.latency.length]);
      for (const [key, value] of Object.entries(patch)) store.record[key] = value === '' ? null : value;
      publish();
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

beforeEach(() => {
  store.record = { id: 'dev1', displayName: 'Y70', capabilities: { surface: 'y70', touch: true }, backgroundMode: 'shader', backgroundMediaId: null, backgroundMediaType: null };
  store.patches = [];
  store.topics.clear();
  store.n = 0;
});

function mount() {
  return renderHook(() => {
    const recordState = usePanelRecord('dev1');
    return { panelTheme: usePanelTheme(recordState, 'dev1'), recordState };
  });
}

describe('a media commit through the record, patch and theme state', () => {
  for (const latency of [[5, 25], [25, 5], [5, 5], [40, 1]]) {
    it(`leaves the record and the shown theme on media with the new id (patch latencies ${latency.join('/')})`, async () => {
      store.latency = latency;
      const { result } = mount();
      await waitFor(() => expect(result.current.recordState.record?.backgroundMode).toBe('shader'));
      act(() => result.current.panelTheme.commitBackgroundMedia('m-new', 'animated', false));
      await act(async () => { await wait(200); });
      expect(store.record.backgroundMode).toBe('media');
      expect(store.record.backgroundMediaId).toBe('m-new');
      expect(result.current.recordState.record?.backgroundMode).toBe('media');
      expect(result.current.recordState.record?.backgroundMediaId).toBe('m-new');
      expect(result.current.panelTheme.theme.backgroundMode).toBe('media');
      expect(result.current.panelTheme.theme.backgroundMediaId).toBe('m-new');
    });
  }

  it('sends the media mode and the media in one patch', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.recordState.loaded).toBe(true));
    act(() => result.current.panelTheme.commitBackgroundMedia('m-new', 'static', false));
    await act(async () => { await wait(100); });
    expect(store.patches).toHaveLength(1);
    expect(store.patches[0]).toMatchObject({ backgroundMode: 'media', backgroundMediaId: 'm-new', backgroundMediaType: 'static' });
  });

  it('a media pick from the Background tab picker also lands on media mode', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.recordState.loaded).toBe(true));
    act(() => result.current.panelTheme.commitBackgroundMedia('m-pick', 'static', false));
    await act(async () => { await wait(100); });
    expect(store.record.backgroundMode).toBe('media');
    expect(result.current.panelTheme.theme.backgroundMode).toBe('media');
  });

  it('a panel on the desktop backdrop ends on the theme backdrop with media, in one patch', async () => {
    store.record.backdrop = 'desktop';
    const { result } = mount();
    await waitFor(() => expect(result.current.recordState.record?.backdrop).toBe('desktop'));
    act(() => result.current.panelTheme.commitBackgroundMedia('m-new', 'animated', false));
    await act(async () => { await wait(150); });
    expect(store.patches).toHaveLength(1);
    expect(store.patches[0]).toMatchObject({ backdrop: 'theme', backgroundMode: 'media', backgroundMediaId: 'm-new' });
    expect(store.record.backdrop).toBe('theme');
    expect(result.current.recordState.record?.backdrop).toBe('theme');
    expect(result.current.panelTheme.theme.backdrop).toBe('theme');
    expect(result.current.panelTheme.theme.backgroundMode).toBe('media');
  });

  it('leaves the backdrop out of the patch when it is already theme', async () => {
    store.record.backdrop = 'theme';
    const { result } = mount();
    await waitFor(() => expect(result.current.recordState.loaded).toBe(true));
    act(() => result.current.panelTheme.commitBackgroundMedia('m-pick', 'static', false));
    await act(async () => { await wait(100); });
    expect(store.patches[0]).not.toHaveProperty('backdrop');
  });
});
