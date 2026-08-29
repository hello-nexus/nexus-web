// One SDK widget instance can be on screen twice at once: the panel cell keeps
// rendering behind the fullscreen (immersive) view of the same widget. Both
// mounts drive one worker, so closing the fullscreen view must neither dispose
// that worker (the cell freezes) nor leave it sized for the fullscreen view
// (the cell keeps drawing at fullscreen scale, its content out of frame).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

interface FakeHandle { receiver: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }

const sizeOf = (el: Element, attr: string): number => {
  const host = el.closest('[data-view]');
  return host ? Number(host.getAttribute(attr) ?? 0) : 0;
};

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

type Props = { width: number; height: number };

describe('SandboxedWidget shared-worker mounts', () => {
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true, get() { return sizeOf(this as Element, 'data-w'); },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true, get() { return sizeOf(this as Element, 'data-h'); },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    vi.doUnmock('../host');
    vi.doUnmock('../RemoteTree');
  });

  const mount = async (id: string, { width, height }: Props) => {
    const { SandboxedWidget, spawnSpy, handles } = await loadSandbox();
    const view = ({ w, h }: { w: number; h: number }) => (
      <div data-view="" data-w={w} data-h={h}>
        <SandboxedWidget runtimeUrl="blob:rt" entryUrl="blob:e" widgetId={`app-${id}`} instanceId={`i-${id}`} />
      </div>
    );
    const cell = render(view({ w: width, h: height }));
    return { spawnSpy, handles, cell, view };
  };

  it('a second mount of the same instance reuses the worker, and closing it neither disposes nor leaves the size behind', async () => {
    const { spawnSpy, handles, view } = await mount('shared', { width: 380, height: 80 });
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const handle = handles[0];
    expect(spawnSpy.mock.calls[0][2]).toMatchObject({ size: { width: 380, height: 80 } });

    // The fullscreen view mounts alongside the cell: same worker, its own size.
    const full = render(view({ w: 640, h: 1150 }));
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(handle.update).toHaveBeenCalledWith({ size: { width: 640, height: 1150 } });

    handle.update.mockClear();
    full.unmount();

    // The cell is still on screen: the worker survives the keep-alive window...
    vi.advanceTimersByTime(5000);
    expect(handle.dispose).not.toHaveBeenCalled();
    // ...and it is sized for the cell again, not the fullscreen view.
    expect(handle.update).toHaveBeenCalledWith({ size: { width: 380, height: 80 } });
  });

  it('disposes once the last mount is gone', async () => {
    const { handles, cell } = await mount('last', { width: 200, height: 200 });
    const handle = handles[0];

    cell.unmount();
    expect(handle.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });
});
