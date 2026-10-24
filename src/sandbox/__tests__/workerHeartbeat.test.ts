// Host watchdog for SDK app workers: ping every interval, armed by the first pong, fires after consecutive misses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../telemetry/appErrorReporting', () => ({ reportAppError: vi.fn() }));
vi.mock('@quilted/threads', () => ({
  retain: vi.fn(),
  release: vi.fn(),
  ThreadMessagePort: { import: () => ({ render: () => new Promise(() => {}), update: vi.fn() }) },
}));
vi.mock('@remote-dom/core', () => ({ RemoteReceiver: class {} }));
vi.mock('../../lib/monitoringStore', () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), getMonitoringFrame: () => null }));

class FakeWorker {
  static last: FakeWorker;
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  pings = 0;
  terminated = false;
  constructor() { FakeWorker.last = this; }
  addEventListener(type: string, cb: (ev: unknown) => void) { (this.listeners[type] ??= []).push(cb); }
  postMessage(m: { type?: string }) { if (m?.type === 'nexus.ping') this.pings++; }
  terminate() { this.terminated = true; }
  pong() { for (const cb of this.listeners.message ?? []) cb({ data: { type: 'nexus.pong' } }); }
}

let visibility: DocumentVisibilityState = 'visible';

async function spawn(extra: { isActive?: () => boolean } = {}) {
  const { spawnSandboxedWidget, PING_INTERVAL_MS } = await import('../host');
  const onUnresponsive = vi.fn();
  const ctx = { instanceId: 'i', widgetId: 'com.test.app', display: {}, locale: 'en', size: { width: 1, height: 1 }, settings: {}, local: {}, api: {}, onUnresponsive, ...extra };
  const handle = spawnSandboxedWidget('blob:rt', 'blob:entry', ctx as never);
  return { worker: FakeWorker.last, onUnresponsive, handle, tick: (n = 1) => vi.advanceTimersByTime(PING_INTERVAL_MS * n) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('MessageChannel', class { port1 = { start() {}, close() {} }; port2 = {}; });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SDK worker heartbeat', () => {
  it('does not fire while the worker keeps answering', async () => {
    const { worker, onUnresponsive, tick } = await spawn();
    for (let i = 0; i < 20; i++) { tick(); worker.pong(); }
    expect(worker.pings).toBe(20);
    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('fires after three unanswered pings once armed', async () => {
    const { worker, onUnresponsive, tick } = await spawn();
    tick(); worker.pong();
    // The first unanswered ping goes out on the next tick; the third miss lands three ticks after it.
    tick(3);
    expect(onUnresponsive).not.toHaveBeenCalled();
    tick();
    expect(onUnresponsive).toHaveBeenCalledTimes(1);
    // The watchdog keeps running, so a declined restart is retried.
    tick(3);
    expect(onUnresponsive).toHaveBeenCalledTimes(1);
    tick();
    expect(onUnresponsive).toHaveBeenCalledTimes(2);
  });

  it('a late pong resets the miss count', async () => {
    const { worker, onUnresponsive, tick } = await spawn();
    tick(); worker.pong();
    tick(2); worker.pong();
    tick(2);
    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('tolerates a slow first load, then treats a silent worker like any other', async () => {
    const { FIRST_PONG_GRACE_MS, PING_INTERVAL_MS } = await import('../host');
    const { onUnresponsive, tick } = await spawn();
    tick(FIRST_PONG_GRACE_MS / PING_INTERVAL_MS - 1); // last tick before the grace ends
    expect(onUnresponsive).not.toHaveBeenCalled();
    // Misses start counting on the first tick at or past the grace.
    tick(2);
    expect(onUnresponsive).not.toHaveBeenCalled();
    tick();
    expect(onUnresponsive).toHaveBeenCalledTimes(1);
  });

  it('does not count misses while the document is hidden', async () => {
    const { worker, onUnresponsive, tick } = await spawn();
    tick(); worker.pong();
    visibility = 'hidden';
    tick(20);
    visibility = 'visible';
    tick(3);
    expect(onUnresponsive).not.toHaveBeenCalled();
    tick();
    expect(onUnresponsive).toHaveBeenCalledTimes(1);
  });

  it('idles while the widget is unmounted', async () => {
    let active = false;
    const { worker, onUnresponsive, tick } = await spawn({ isActive: () => active });
    active = true; tick(); worker.pong();
    active = false;
    tick(20);
    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('stops pinging once disposed', async () => {
    const { worker, handle, tick } = await spawn();
    tick();
    handle.dispose();
    tick(10);
    expect(worker.pings).toBe(1);
  });
});

describe('worker pong responder', () => {
  it('lives in the host-composed worker source', async () => {
    const { composeSdkWorkerSource } = await import('../sandboxBoot');
    const src = composeSdkWorkerSource('blob:rt', 'blob:entry');
    expect(src).toContain("'nexus.ping'");
    expect(src).toContain("'nexus.pong'");
    expect(src.indexOf("'nexus.ping'")).toBeLessThan(src.indexOf('import("blob:rt")'));
  });
});
