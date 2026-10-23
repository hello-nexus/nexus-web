// The real host watchdog driving the real SandboxedWidget restart logic (only the worker, threads and renderer are faked).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const reportAppError = vi.fn();
vi.mock('../../telemetry/appErrorReporting', () => ({ reportAppError: (...a: unknown[]) => reportAppError(...a) }));
vi.mock('@quilted/threads', () => ({
  retain: vi.fn(),
  release: vi.fn(),
  ThreadMessagePort: { import: () => ({ render: () => new Promise(() => {}), update: vi.fn() }) },
}));
vi.mock('@remote-dom/core', () => ({ RemoteReceiver: class {} }));
vi.mock('@remote-dom/core/receivers', () => ({ RemoteReceiver: class {} }));
vi.mock('../../lib/monitoringStore', () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), getMonitoringFrame: () => null }));
vi.mock('../RemoteTree', () => ({ RemoteTree: () => null }));

const workers: Array<{ terminated: boolean }> = [];
class SilentWorker {
  terminated = false;
  constructor() { workers.push(this); }
  addEventListener() {}
  postMessage() {}
  terminate() { this.terminated = true; }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  workers.length = 0;
  reportAppError.mockReset();
  vi.stubGlobal('Worker', SilentWorker);
  vi.stubGlobal('MessageChannel', class { port1 = { start() {}, close() {} }; port2 = {}; });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const advance = (ms: number) => { for (let t = 0; t < ms; t += 5000) act(() => { vi.advanceTimersByTime(5000); }); };

describe('silent worker, real watchdog and widget', () => {
  it('restarts three times, holds at the cap, then restarts again once the window passes', async () => {
    const { SandboxedWidget } = await import('../SandboxedWidget');
    render(<SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId="app-a" instanceId="i-a" />);
    expect(workers).toHaveLength(1);

    advance(5 * 60 * 1000);
    expect(workers).toHaveLength(4);
    expect(workers.slice(0, 3).every((w) => w.terminated)).toBe(true);

    advance(4 * 60 * 1000);
    expect(workers).toHaveLength(4);
    const limitReports = () => reportAppError.mock.calls.filter((c) => String(c[2]).includes('limit reached')).length;
    expect(limitReports()).toBe(1);

    advance(3 * 60 * 1000);
    expect(workers.length).toBeGreaterThan(4);
  });
});
