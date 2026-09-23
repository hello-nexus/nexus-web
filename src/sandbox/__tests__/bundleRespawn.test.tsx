// A widget instance whose bundle URL changes (the app was updated on disk) gets a
// fresh worker running the new code; the same URL across remounts keeps reusing one.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

interface FakeHandle { receiver: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }

async function loadSandbox() {
  vi.resetModules();
  const handles: FakeHandle[] = [];
  const spawnSpy = vi.fn(() => {
    const h: FakeHandle = {
      receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
      update: vi.fn(),
      dispose: vi.fn(),
    };
    handles.push(h);
    return h;
  });
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  vi.doMock('../RemoteTree', () => ({ RemoteTree: () => null }));
  const { SandboxedWidget } = await import('../SandboxedWidget');
  return { SandboxedWidget, spawnSpy, handles };
}

describe('SandboxedWidget bundle identity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.doUnmock('../host');
    vi.doUnmock('../RemoteTree');
  });

  it('respawns on a new bundle URL and disposes the old worker after the keep-alive window', async () => {
    const { SandboxedWidget, spawnSpy, handles } = await loadSandbox();
    const view = (entryUrl: string) => (
      <SandboxedWidget runtimeUrl="blob:rt" entryUrl={entryUrl} widgetId="com.x.app" instanceId="com.x.app:page" surface="page" />
    );
    const r = render(view('blob:v1'));
    r.rerender(view('blob:v1'));
    expect(spawnSpy).toHaveBeenCalledTimes(1);

    r.rerender(view('blob:v2'));
    expect(spawnSpy).toHaveBeenCalledTimes(2);
    expect(spawnSpy.mock.calls[1][1]).toBe('blob:v2');

    vi.runOnlyPendingTimers();
    expect(handles[0].dispose).toHaveBeenCalled();
    expect(handles[1].dispose).not.toHaveBeenCalled();
  });
});
