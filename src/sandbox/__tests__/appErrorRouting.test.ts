// Host-side routing of SDK app faults into the shared error reporter: each path reports once with the app id.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportAppError = vi.fn();
vi.mock('../../telemetry/appErrorReporting', () => ({ reportAppError: (...a: unknown[]) => reportAppError(...a) }));

let renderResult: Promise<void> = new Promise(() => {});
vi.mock('@quilted/threads', () => ({
  retain: vi.fn(),
  release: vi.fn(),
  ThreadMessagePort: { import: () => ({ render: () => renderResult, update: vi.fn() }) },
}));
vi.mock('@remote-dom/core', () => ({ RemoteReceiver: class {} }));
vi.mock('../../lib/monitoringStore', () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), getMonitoringFrame: () => null }));

class FakeWorker {
  static last: FakeWorker;
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  constructor() { FakeWorker.last = this; }
  addEventListener(type: string, cb: (ev: unknown) => void) { (this.listeners[type] ??= []).push(cb); }
  postMessage() {}
  terminate() {}
  emit(type: string, ev: unknown) { for (const cb of this.listeners[type] ?? []) cb(ev); }
}

async function spawn() {
  const { spawnSandboxedWidget } = await import('../host');
  const ctx = { instanceId: 'i', widgetId: 'com.test.app', display: {}, locale: 'en', size: { width: 1, height: 1 }, settings: {}, local: {}, api: {} };
  spawnSandboxedWidget('blob:rt', 'blob:entry', ctx as never);
  return FakeWorker.last;
}

beforeEach(() => {
  vi.resetModules();
  reportAppError.mockReset();
  renderResult = new Promise(() => {});
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('MessageChannel', class { port1 = { start() {}, close() {} }; port2 = {}; });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SDK app error routing in the sandbox host', () => {
  it('reports an uncaught worker error with its location', async () => {
    const w = await spawn();
    w.emit('error', { message: 'x is not a function', filename: 'blob:app', lineno: 7 });
    expect(reportAppError).toHaveBeenCalledTimes(1);
    const [id, path, err] = reportAppError.mock.calls[0] as [string, string, Error];
    expect([id, path]).toEqual(['com.test.app', 'worker-error']);
    expect(err.message).toBe('x is not a function');
    expect(err.stack).toContain('blob:app:7');
  });

  it('reports a failed render', async () => {
    renderResult = Promise.reject(new Error('render exploded'));
    await spawn();
    await Promise.resolve();
    await Promise.resolve();
    expect(reportAppError).toHaveBeenCalledTimes(1);
    expect(reportAppError.mock.calls[0].slice(0, 2)).toEqual(['com.test.app', 'render-failed']);
  });

  it('reports a worker boot failure', async () => {
    const w = await spawn();
    w.emit('message', { data: { type: 'nexus.error', message: 'import failed' } });
    expect(reportAppError).toHaveBeenCalledWith('com.test.app', 'boot-error', 'import failed');
  });

  it('routes nexus.log at level error by origin and ignores other levels', async () => {
    const w = await spawn();
    w.emit('message', { data: { type: 'nexus.log', payload: { level: 'error', message: 'author text' } } });
    w.emit('message', { data: { type: 'nexus.log', payload: { level: 'error', thrown: true, message: 'cb threw' } } });
    w.emit('message', { data: { type: 'nexus.log', payload: { level: 'warn', message: 'just a warning' } } });
    w.emit('message', { data: { type: 'nexus.log', payload: { level: 'info', message: 'fyi' } } });
    expect(reportAppError.mock.calls).toEqual([
      ['com.test.app', 'log-error', 'author text'],
      ['com.test.app', 'callback-error', 'cb threw'],
    ]);
  });

  it('reports an unhandled rejection forwarded by the worker boot', async () => {
    const w = await spawn();
    w.emit('message', { data: { type: 'nexus.log', payload: { level: 'error', rejection: true, message: 'nobody caught me' } } });
    expect(reportAppError).toHaveBeenCalledTimes(1);
    expect(reportAppError).toHaveBeenCalledWith('com.test.app', 'unhandled-rejection', 'nobody caught me');
  });
});

describe('unhandled rejection listener', () => {
  async function install(post: (m: string) => void) {
    const { unhandledRejectionListener } = await import('../workerBoot');
    let handler: ((ev: { reason: unknown }) => void) | null = null;
    const fakeSelf = { addEventListener: (type: string, cb: typeof handler) => { if (type === 'unhandledrejection') handler = cb; } };
    new Function('self', 'post', unhandledRejectionListener('post(m);'))(fakeSelf, post);
    return handler as unknown as (ev: { reason: unknown }) => void;
  }

  it('posts the reason text, including for a null-prototype reason', async () => {
    const post = vi.fn();
    const handler = await install(post);
    handler({ reason: new Error('nobody caught me') });
    handler({ reason: Object.create(null) });
    expect(post.mock.calls).toEqual([['nobody caught me'], ['unhandled rejection']]);
  });

  it('is part of both the widget and the renderer boot scripts', async () => {
    const { workerBootScript, rendererBootScript } = await import('../workerBoot');
    expect(workerBootScript()).toContain('addEventListener("unhandledrejection"');
    expect(workerBootScript()).toContain('rejection: true');
    expect(rendererBootScript()).toContain('addEventListener("unhandledrejection"');
    expect(rendererBootScript()).toContain('type: "rejection"');
  });
});
