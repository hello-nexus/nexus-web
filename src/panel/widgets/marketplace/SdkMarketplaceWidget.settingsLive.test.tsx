// A running SDK tile follows settings changes: a local panel save through the shared bridge, and a
// cross-device `app-settings/{instanceId}` broadcast. Equal documents must not re-push.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MultiplexContext, type MultiplexContextValue } from '../../../hooks/useMultiplexSocket';

vi.mock('../../../api/service', () => ({
  postService: async () => ({ error: false }),
  fetchService: async () => ({ values: { color: 'red' } }),
  resolveHttp: (p: string) => p,
  loopbackFetchInit: {},
}));
vi.mock('../../../api/auth', () => ({ getToken: async () => null, handleUnauthorized: async () => null }));
vi.mock('./useSdkBundle', () => ({
  useSdkBundle: () => ({ entryUrl: 'blob:entry', failed: false }),
  useSdkRuntime: () => ({ runtimeUrl: 'blob:rt', failed: false }),
}));
vi.mock('../common/PanelPreviewContext', () => ({ usePanelPreview: () => false }));

const seen: Array<Record<string, unknown> | undefined> = [];
vi.mock('../../../sandbox/SandboxedWidget', () => ({
  SandboxedWidget: (p: { settings?: Record<string, unknown> }) => { seen.push(p.settings); return null; },
}));

import { SdkMarketplaceWidget } from './SdkMarketplaceWidget';
import { WidgetSettingsBridge, settingsEqual } from '../../../widgets/settingsBridge';

const listing = { id: 'com.example.app', name: 'Demo', capabilities: {} } as never;
const listeners = new Map<string, (d: unknown) => void>();
const ctx = {
  connected: true,
  subscribe: (t: string, l: (d: unknown) => void) => { listeners.set(t, l); },
  unsubscribe: (t: string) => { listeners.delete(t); },
} as unknown as MultiplexContextValue;

const mount = () => render(
  <MultiplexContext.Provider value={ctx}>
    <SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" />
  </MultiplexContext.Provider>,
);
const last = () => seen[seen.length - 1];

beforeEach(() => { seen.length = 0; listeners.clear(); WidgetSettingsBridge._resetSharedForTests(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SDK tile live settings', () => {
  it('picks up a settings-panel save through the shared bridge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ widgetId: 'x', values: { color: 'blue' } }) })));
    mount();
    await act(async () => {});
    expect(last()).toEqual({ color: 'red' });
    // The panel resolves the same instance through for(), not a private copy.
    await act(async () => { await WidgetSettingsBridge.for('inst-1').patch({ set: { color: 'blue' } }); });
    expect(last()).toEqual({ color: 'blue' });
  });

  it('applies a broadcast frame', async () => {
    mount();
    await act(async () => {});
    act(() => listeners.get('app-settings/inst-1')!({ values: { color: 'green' }, revision: 5 }));
    expect(last()).toEqual({ color: 'green' });
  });

  it('ignores malformed frames and does not re-push an equal document', async () => {
    mount();
    await act(async () => {});
    const before = seen.length;
    act(() => listeners.get('app-settings/inst-1')!({ values: { color: 'red' }, revision: 6 }));
    act(() => listeners.get('app-settings/inst-1')!({ nope: true }));
    act(() => listeners.get('app-settings/inst-1')!(null));
    expect(seen.length).toBe(before);
  });
});

describe('SDK tile settings ordering and lifetime', () => {
  const frame = (values: Record<string, unknown>, revision?: number) =>
    act(() => listeners.get('app-settings/inst-1')!({ values, revision }));

  it('drops a stale revision and out-of-order frames', async () => {
    mount();
    await act(async () => {});
    frame({ color: 'b' }, 10);
    frame({ color: 'old' }, 9);
    expect(last()).toEqual({ color: 'b' });
    frame({ color: 'c' }, 11);
    frame({ color: 'b2' }, 10);
    expect(last()).toEqual({ color: 'c' });
  });

  it('applies frames with no revision (older service)', async () => {
    mount();
    await act(async () => {});
    frame({ color: 'x' });
    expect(last()).toEqual({ color: 'x' });
    frame({ color: 'y' });
    expect(last()).toEqual({ color: 'y' });
  });

  it('copies values so callers cannot mutate the cache', () => {
    const b = new WidgetSettingsBridge('copy');
    const src = { a: 1 };
    b.apply(src);
    src.a = 2;
    expect(b.get()).toEqual({ a: 1 });
  });

  it('does not apply a load that started before a newer apply when revisions are absent', async () => {
    const b = new WidgetSettingsBridge('race');
    const p = b.load();
    b.apply({ a: 'newer' });
    await p;
    expect(b.get()).toEqual({ a: 'newer' });
  });

  it('applies an empty load result and drops the shared entry after the last release', () => {
    const b = WidgetSettingsBridge.for('reuse');
    const r1 = b.retain();
    const r2 = b.retain();
    r1();
    expect(WidgetSettingsBridge.for('reuse')).toBe(b);
    r2();
    expect(WidgetSettingsBridge.for('reuse')).not.toBe(b);
  });

  it('reloads on reconnect', async () => {
    const c = { ...ctx, connected: false } as unknown as MultiplexContextValue;
    const { rerender } = render(
      <MultiplexContext.Provider value={c}><SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" /></MultiplexContext.Provider>,
    );
    await act(async () => {});
    frame({ color: 'stale' }, 1);
    rerender(
      <MultiplexContext.Provider value={{ ...c, connected: true } as unknown as MultiplexContextValue}>
        <SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" />
      </MultiplexContext.Provider>,
    );
    await act(async () => {});
    expect(last()).toEqual({ color: 'red' });
  });
});

describe('settingsEqual', () => {
  it('compares structurally, ignoring key order', () => {
    expect(settingsEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(settingsEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(settingsEqual({ a: [] }, { a: {} })).toBe(false);
  });
});
