// Preview-mode sandbox guarantees: a preview SandboxContext performs no real
// I/O even for preview-unaware apps - net.fetch is refused without touching
// the proxy, dispatch resolves the { ok: false } envelope without calling the
// host dispatcher, persistLocal never writes, and the welcome payload carries
// the preview flag so the SDK runtime's usePreview() can branch.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { spawnSandboxedWidget, type SandboxContext } from '../host';
import { proxyFetch } from '../proxyClient';

vi.mock('../proxyClient', () => ({
  proxyFetch: vi.fn(() => Promise.resolve({ status: 200, body: '{}', contentType: 'application/json', base64: false })),
}));

type Listener = (e: { data: unknown }) => void;

// Captures host→worker messages and lets tests fire worker→host events.
class FakeWorker {
  static instances: FakeWorker[] = [];
  sent: unknown[] = [];
  listeners = new Map<string, Listener[]>();
  constructor() { FakeWorker.instances.push(this); }
  addEventListener(type: string, cb: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  postMessage(msg: unknown) { this.sent.push(msg); }
  terminate() {}
  emit(data: unknown) {
    for (const cb of this.listeners.get('message') ?? []) cb({ data });
  }
}

function makeContext(preview: boolean, idSuffix: string): SandboxContext {
  return {
    instanceId: `inst-${idSuffix}`,
    widgetId: `widget-${idSuffix}`,
    surface: 'cell',
    preview,
    size: { width: 100, height: 100 },
    settings: {},
    local: {},
    netFetch: ['api.example.com'],
    sensorsRead: [],
    api: { persistLocal: vi.fn(), dispatch: vi.fn() },
  };
}

describe('host preview gating', () => {
  const realCreateObjectUrl = URL.createObjectURL;
  const realRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    // Direct assignment - vi.unstubAllGlobals() doesn't cover it, restore below.
    URL.createObjectURL = vi.fn(() => 'blob:test') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    URL.createObjectURL = realCreateObjectUrl;
    URL.revokeObjectURL = realRevokeObjectUrl;
    vi.mocked(proxyFetch).mockClear();
  });

  it('preview: net.fetch is refused without touching proxyFetch; welcome carries preview', () => {
    const handle = spawnSandboxedWidget('blob:runtime', 'blob:entry', makeContext(true, 'p1'));
    const worker = FakeWorker.instances[0];

    worker.emit({ type: 'nexus.net.fetch', id: 7, payload: { url: 'https://api.example.com/x' } });

    expect(proxyFetch).not.toHaveBeenCalled();
    const reply = worker.sent.find(m => (m as { type?: string; id?: number }).type === 'nexus.reply' && (m as { id?: number }).id === 7);
    expect(reply).toMatchObject({ error: { code: -32002 } });

    const welcome = worker.sent.find(m => (m as { type?: string }).type === 'nexus.welcome');
    expect(welcome).toMatchObject({ payload: { preview: true } });

    handle.dispose();
  });

  it('live: net.fetch proxies and welcome carries preview: false', async () => {
    const handle = spawnSandboxedWidget('blob:runtime', 'blob:entry', makeContext(false, 'l1'));
    const worker = FakeWorker.instances[0];

    worker.emit({ type: 'nexus.net.fetch', id: 9, payload: { url: 'https://api.example.com/x' } });

    expect(proxyFetch).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const reply = worker.sent.find(m => (m as { type?: string; id?: number }).type === 'nexus.reply' && (m as { id?: number }).id === 9);
      expect(reply).toMatchObject({ result: { status: 200 } });
    });

    const welcome = worker.sent.find(m => (m as { type?: string }).type === 'nexus.welcome');
    expect(welcome).toMatchObject({ payload: { preview: false } });

    handle.dispose();
  });
});

describe('SandboxedWidget preview stubs', () => {
  afterEach(() => cleanup());

  it('preview context stubs persistLocal + dispatch and never calls onDispatch', async () => {
    vi.resetModules();
    const spawnSpy = vi.fn(() => ({
      receiver: { connection: { mutate: vi.fn() }, subscribe: vi.fn(), root: { children: [] } },
      update: vi.fn(),
      dispose: vi.fn(),
    }));
    vi.doMock('../host', () => ({ spawnSandboxedWidget: spawnSpy }));
    vi.doMock('../RemoteTree', () => ({ RemoteTree: () => null }));
    const { SandboxedWidget } = await import('../SandboxedWidget');

    const onDispatch = vi.fn(() => Promise.resolve({ ok: true }));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <SandboxedWidget
        runtimeUrl="blob:runtime"
        entryUrl="blob:entry"
        widgetId="w-preview-stub"
        instanceId="i-preview-stub"
        preview
        onDispatch={onDispatch}
      />,
    );

    await waitFor(() => expect(spawnSpy).toHaveBeenCalledTimes(1));
    const ctx = (spawnSpy.mock.calls[0] as unknown as [string, string, SandboxContext])[2];
    expect(ctx.preview).toBe(true);

    await expect(ctx.api.dispatch('anything')).resolves.toEqual({ ok: false });
    expect(onDispatch).not.toHaveBeenCalled();

    ctx.api.persistLocal({ a: 1 });
    expect(setItemSpy).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
    vi.doUnmock('../host');
    vi.doUnmock('../RemoteTree');
  });
});
