// The host wiring behind useImmersive().enter: a widget's tile-surface worker
// gets an enterImmersive callback only when the panel offered one and the
// render is neither the immersive worker itself nor a preview. Calling it
// reaches the exact callback the panel wired (in real use, PanelApp's
// enterImmersive(widget.id)), never a widget-chosen id.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

interface FakeHandle { receiver: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
interface SpawnedApi { enterImmersive?: () => void }

/** The newest mount's press hook, as the mocked RemoteTree received it. */
const gesture: { current?: () => void } = {};
const press = () => act(() => { gesture.current!(); });

async function loadSandbox() {
  vi.resetModules();
  const spawnSpy = vi.fn(() => {
    const h: FakeHandle = {
      receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
      update: vi.fn(),
      dispose: vi.fn(),
    };
    return h;
  });
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  vi.doMock('../RemoteTree', () => ({
    RemoteTree: (p: { onGesture?: () => void }) => { gesture.current = p.onGesture; return null; },
  }));
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

describe('SandboxedWidget enterImmersive wiring', () => {
  it('is wired on the cell surface when the panel offers a callback', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const onEnterImmersive = vi.fn();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-a" instanceId="i-a" onEnterImmersive={onEnterImmersive} />);
    const api = spawnedApi(spawnSpy);
    expect(api.enterImmersive).toBeTypeOf('function');
    press();
    api.enterImmersive!();
    expect(onEnterImmersive).toHaveBeenCalledTimes(1);
    // The press is spent: a second call without a new one opens nothing.
    api.enterImmersive!();
    expect(onEnterImmersive).toHaveBeenCalledTimes(1);
  });

  it('opens nothing unless a press the host passed on came just before, so a timer cannot open it', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const onEnterImmersive = vi.fn();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-t" instanceId="i-t" onEnterImmersive={onEnterImmersive} />);
    const api = spawnedApi(spawnSpy);
    api.enterImmersive!();
    expect(onEnterImmersive).not.toHaveBeenCalled();
    press();
    vi.advanceTimersByTime(60_000);
    api.enterImmersive!();
    expect(onEnterImmersive).not.toHaveBeenCalled();
  });

  it('reaches the newest mount of a reused worker, and nothing once that mount offers no callback', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const first = vi.fn();
    const second = vi.fn();
    const props = { runtimeUrl: 'blob:rt', entryUrl: 'blob:e', widgetId: 'app-r', instanceId: 'i-r' };
    const a = render(<SandboxedWidget {...props} onEnterImmersive={first} />);
    const api = spawnedApi(spawnSpy);
    a.unmount();
    const b = render(<SandboxedWidget {...props} onEnterImmersive={second} />);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    press();
    api.enterImmersive!();
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
    b.rerender(<SandboxedWidget {...props} />);
    press();
    api.enterImmersive!();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is absent on the cell surface when the panel offers none', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-b" instanceId="i-b" />);
    expect(spawnedApi(spawnSpy).enterImmersive).toBeUndefined();
  });

  it('is absent on the immersive worker itself, even if a callback is passed', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const onEnterImmersive = vi.fn();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-c" instanceId="i-c" surface="immersive" onEnterImmersive={onEnterImmersive} />);
    expect(spawnedApi(spawnSpy).enterImmersive).toBeUndefined();
  });

  it('is absent on a preview render, even if a callback is passed', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    const onEnterImmersive = vi.fn();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-d" instanceId="i-d" preview onEnterImmersive={onEnterImmersive} />);
    expect(spawnedApi(spawnSpy).enterImmersive).toBeUndefined();
  });
});
