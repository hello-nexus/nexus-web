// The host wiring behind useOpaque(): a tile's cell-surface worker reports
// through setOpaque to the panel's onOpaqueChange, a remount that adopts the
// cached worker picks the last report back up, and a leaving mount hands the
// background back. The immersive worker and a preview get no setOpaque.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

interface SpawnedApi { setOpaque?: (opaque: boolean) => void }

async function loadSandbox() {
  vi.resetModules();
  const spawnSpy = vi.fn(() => ({
    receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
    update: vi.fn(),
    dispose: vi.fn(),
  }));
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  vi.doMock('../RemoteTree', () => ({ RemoteTree: () => null }));
  const { SandboxedWidget } = await import('../SandboxedWidget');
  return { SandboxedWidget, spawnSpy };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.doUnmock('../host');
  vi.doUnmock('../RemoteTree');
});

function spawnedApi(spawnSpy: ReturnType<typeof vi.fn>): SpawnedApi {
  return (spawnSpy.mock.calls[0][2] as { api: SpawnedApi }).api;
}

describe('SandboxedWidget setOpaque wiring', () => {
  it('reports the worker\'s opacity to the tile, and clears it when the tile leaves', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const onOpaqueChange = vi.fn();
    const r = render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-a" instanceId="i-a" onOpaqueChange={onOpaqueChange} />);
    const api = spawnedApi(spawnSpy);
    act(() => { api.setOpaque!(true); });
    expect(onOpaqueChange).toHaveBeenLastCalledWith(true);
    act(() => { api.setOpaque!(false); });
    expect(onOpaqueChange).toHaveBeenLastCalledWith(false);
    act(() => { api.setOpaque!(true); });
    r.unmount();
    expect(onOpaqueChange).toHaveBeenLastCalledWith(false);
  });

  it('re-reports the last value to a remount that adopts the cached worker', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const props = { runtimeUrl: 'blob:rt', entryUrl: 'blob:e', widgetId: 'app-r', instanceId: 'i-r' };
    const a = render(<SandboxedWidget {...props} onOpaqueChange={vi.fn()} />);
    act(() => { spawnedApi(spawnSpy).setOpaque!(true); });
    a.unmount();
    const second = vi.fn();
    render(<SandboxedWidget {...props} onOpaqueChange={second} />);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(true);
  });

  it('is absent on the immersive worker and on a preview', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-c" instanceId="i-c" surface="immersive" onOpaqueChange={vi.fn()} />);
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-d" instanceId="i-d" preview onOpaqueChange={vi.fn()} />);
    expect((spawnSpy.mock.calls[0][2] as { api: SpawnedApi }).api.setOpaque).toBeUndefined();
    expect((spawnSpy.mock.calls[1][2] as { api: SpawnedApi }).api.setOpaque).toBeUndefined();
  });
});
