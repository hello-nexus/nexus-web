import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { RemoteReceiver } from '@remote-dom/core/receivers';
import { ROOT_ID, NODE_TYPE_ELEMENT, MUTATION_TYPE_INSERT_CHILD } from '@remote-dom/core';

const fetchBundleFile = vi.fn();
vi.mock('../../panel/widgets/marketplace/useSdkBundle', () => ({ fetchBundleFile: (...a: unknown[]) => fetchBundleFile(...a) }));
const listingVersion: string | undefined = '1.0.0';
vi.mock('../../widgets/marketplaceRegistry', () => ({
  getMarketplaceListing: () => ({ version: listingVersion }),
  subscribeMarketplaceRegistry: () => () => {},
}));
vi.mock('../../api/service', () => ({ fetchServiceBlob: vi.fn() }));

import { RemoteTree } from '../RemoteTree';
import { CanvasComposite } from '../ui/CanvasComposite';
import { SdkAppIdContext } from '../appIdContext';
import { PanelPreviewProvider } from '../../panel/widgets/common/PanelPreviewContext';

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: Array<Record<string, unknown>> = [];
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  constructor() { FakeWorker.all.push(this); }
  addEventListener(type: string, cb: (ev: unknown) => void) { (this.listeners[type] ??= []).push(cb); }
  postMessage(data: Record<string, unknown>) { this.posted.push(data); }
  terminate() {}
  emit(data: Record<string, unknown>) { for (const cb of this.listeners.message ?? []) cb({ data }); }
}

const canvasEl = (id: string, properties: Record<string, unknown>) => ({
  id, type: NODE_TYPE_ELEMENT, element: 'ui-canvas', properties, attributes: {}, eventListeners: {}, children: [],
});
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

beforeEach(() => {
  FakeWorker.all = [];
  fetchBundleFile.mockReset().mockResolvedValue(new Blob(['export {}']));
  vi.stubGlobal('Worker', FakeWorker);
  let n = 0;
  URL.createObjectURL = () => `blob:test/${n++}`;
  URL.revokeObjectURL = () => {};
  (HTMLCanvasElement.prototype as unknown as { transferControlToOffscreen: () => unknown }).transferControlToOffscreen = () => ({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountTree(properties: Record<string, unknown>, appId = 'com.test.app') {
  const receiver = new RemoteReceiver();
  const view = render(
    <SdkAppIdContext.Provider value={appId}><RemoteTree receiver={receiver} /></SdkAppIdContext.Provider>,
  );
  act(() => {
    receiver.connection.mutate([[MUTATION_TYPE_INSERT_CHILD, ROOT_ID, canvasEl('c1', properties), 0]] as never);
  });
  return view;
}

describe('CanvasComposite (ui-canvas)', () => {
  it('preview mode renders a static placeholder: no fetch, no worker, no canvas', async () => {
    const receiver = new RemoteReceiver();
    const { container } = render(
      <SdkAppIdContext.Provider value="com.test.app">
        <PanelPreviewProvider value={true}><RemoteTree receiver={receiver} /></PanelPreviewProvider>
      </SdkAppIdContext.Provider>,
    );
    act(() => {
      receiver.connection.mutate([[MUTATION_TYPE_INSERT_CHILD, ROOT_ID, canvasEl('c0', { renderer: 'renderer.mjs' }), 0]] as never);
    });
    await flush();
    expect(fetchBundleFile).not.toHaveBeenCalled();
    expect(FakeWorker.all).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders nothing without a renderer path', async () => {
    const { container } = mountTree({});
    await flush();
    expect(fetchBundleFile).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('shows a spinner placeholder, then the canvas once the renderer reports ready', async () => {
    const { container } = mountTree({ renderer: 'renderer.mjs', props: { a: 1 } });
    await flush();
    expect(container.querySelector('canvas')).toBeTruthy();
    const worker = FakeWorker.all[0];
    act(() => worker.emit({ type: 'booted' }));
    expect(worker.posted[0]).toMatchObject({ type: 'init', props: { a: 1 } });
    const holder = container.querySelector('canvas')!.parentElement as HTMLElement;
    expect(holder.style.opacity).toBe('0');
    act(() => worker.emit({ type: 'ready' }));
    expect(holder.style.opacity).toBe('1');
  });

  it('shows the generic load error when the renderer cannot be fetched', async () => {
    fetchBundleFile.mockResolvedValue(null);
    mountTree({ renderer: 'renderer.mjs' });
    await waitFor(() => expect(screen.getByText('sdk.canvas.loadError')).toBeTruthy());
  });

  it('claims the sheet-swipe region only when interactive', async () => {
    const off = mountTree({ renderer: 'renderer.mjs' });
    expect(off.container.querySelector('[data-panel-no-sheet-swipe]')).toBeNull();
    cleanup();
    const on = mountTree({ renderer: 'renderer.mjs', interactive: true });
    expect(on.container.querySelector('[data-panel-no-sheet-swipe]')).toBeTruthy();
  });

  it('delivers renderer posts to onMessage and pushes prop changes', async () => {
    const onMessage = vi.fn();
    const view = render(
      <SdkAppIdContext.Provider value="com.test.app">
        <CanvasComposite renderer="renderer.mjs" props={{ n: 1 }} __events={{ message: onMessage }} />
      </SdkAppIdContext.Provider>,
    );
    await flush();
    const worker = FakeWorker.all[0];
    act(() => worker.emit({ type: 'booted' }));
    act(() => worker.emit({ type: 'post', data: { hi: true } }));
    expect(onMessage).toHaveBeenCalledWith({ hi: true });
    view.rerender(
      <SdkAppIdContext.Provider value="com.test.app">
        <CanvasComposite renderer="renderer.mjs" props={{ n: 2 }} __events={{ message: onMessage }} />
      </SdkAppIdContext.Provider>,
    );
    expect(worker.posted.filter((m) => m.type === 'props')).toEqual([{ type: 'props', props: { n: 2 } }]);
  });

  it('mounts sharing a key use one worker; unshared mounts get their own', async () => {
    const tree = (share?: string) => (
      <SdkAppIdContext.Provider value="com.test.app">
        <CanvasComposite renderer="renderer.mjs" share={share} />
        <CanvasComposite renderer="renderer.mjs" share={share} />
      </SdkAppIdContext.Provider>
    );
    const shared = render(tree('stage'));
    await flush();
    expect(FakeWorker.all).toHaveLength(1);
    expect(shared.container.querySelectorAll('canvas')).toHaveLength(1);
    shared.unmount();
    FakeWorker.all = [];
    const solo = render(tree());
    await flush();
    expect(FakeWorker.all).toHaveLength(2);
    expect(solo.container.querySelectorAll('canvas')).toHaveLength(2);
  });
});
