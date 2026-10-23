// SandboxedWidget restarts an unresponsive worker like a fresh mount, capped per instance.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const reportAppError = vi.fn();

async function loadSandbox() {
  vi.resetModules();
  const spawnSpy = vi.fn(() => ({
    receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
    update: vi.fn(),
    dispose: vi.fn(),
  }));
  vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
  vi.doMock('../RemoteTree', () => ({ RemoteTree: () => null }));
  vi.doMock('../../telemetry/appErrorReporting', () => ({ reportAppError: (...a: unknown[]) => reportAppError(...a) }));
  const { SandboxedWidget } = await import('../SandboxedWidget');
  return { SandboxedWidget, spawnSpy };
}

beforeEach(() => {
  vi.useFakeTimers();
  reportAppError.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('../host');
  vi.doUnmock('../RemoteTree');
  vi.doUnmock('../../telemetry/appErrorReporting');
});

type Spawn = ReturnType<typeof vi.fn>;
const fire = (spawnSpy: Spawn, n: number) => act(() => { (spawnSpy.mock.calls[n][2] as { onUnresponsive: () => void }).onUnresponsive(); });

describe('SandboxedWidget unresponsive worker restart', () => {
  it('disposes the dead worker, spawns a fresh one, and reports it', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-a" instanceId="i-a" />);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const first = spawnSpy.mock.results[0].value as { dispose: Spawn };
    fire(spawnSpy, 0);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(spawnSpy).toHaveBeenCalledTimes(2);
    expect(reportAppError).toHaveBeenCalledWith('app-a', 'worker-unresponsive', 'worker unresponsive, restarted');
    expect(console.warn).toHaveBeenCalledWith('[sdk:app-a] worker unresponsive, restarted');
  });

  it('stops restarting after three within ten minutes, and resumes once they age out', async () => {
    const { SandboxedWidget, spawnSpy } = await loadSandbox();
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-a" instanceId="i-a" />);
    for (let i = 0; i < 3; i++) fire(spawnSpy, i);
    expect(spawnSpy).toHaveBeenCalledTimes(4);
    fire(spawnSpy, 3);
    expect(spawnSpy).toHaveBeenCalledTimes(4);
    expect(reportAppError).toHaveBeenLastCalledWith('app-a', 'worker-unresponsive', 'worker unresponsive, restart limit reached');
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    fire(spawnSpy, 3);
    expect(spawnSpy).toHaveBeenCalledTimes(5);
  });
});
