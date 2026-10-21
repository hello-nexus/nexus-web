// Worker end of the Canvas renderer protocol. Kept apart from renderer.ts so
// tests can drive it with a fake port; renderer.ts binds it to the real worker
// global. Must not import react or reach for __nexusRuntime: it is inlined into
// the app's renderer module, which runs in a worker without the SDK runtime.

export interface CanvasPointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel' | 'wheel';
  pointerId: number;
  pointerType: string;
  /** Canvas-relative CSS px. */
  x: number;
  y: number;
  buttons: number;
  deltaY?: number;
  deltaMode?: number;
}

export interface RendererSize {
  /** CSS px. */
  width: number;
  height: number;
  /** Device pixel ratio the host capped for this canvas. */
  pixelRatio: number;
}

export interface RendererContext {
  canvas: OffscreenCanvas;
  size: RendererSize;
  /** Latest props of the mount holding the canvas. */
  props: Record<string, unknown>;
  /** Reads a file of the app bundle through the host. */
  readAsset(path: string): Promise<ArrayBuffer>;
  /** Sends JSON to the holding mount's onMessage. */
  post(data: unknown): void;
  onProps(cb: (props: Record<string, unknown>) => void): void;
  /** Fires after the canvas backing store was resized to the new size. */
  onResize(cb: (size: RendererSize) => void): void;
  onPointer(cb: (e: CanvasPointerEvent) => void): void;
  /** Runs on the worker's animation frame, only while visible. dt is in seconds and capped. */
  onFrame(cb: (dt: number, now: number) => void): void;
  onVisibility(cb: (visible: boolean) => void): void;
  /** Call once the first frame is drawn; the host then reveals the canvas. */
  ready(): void;
}

/** Messages the host sends to the renderer worker. */
export type HostToRenderer =
  | { type: 'init'; canvas: OffscreenCanvas; size: RendererSize; props: Record<string, unknown>; visible: boolean }
  | { type: 'props'; props: Record<string, unknown> }
  | { type: 'resize'; size: RendererSize }
  | { type: 'pointer'; event: CanvasPointerEvent }
  | { type: 'visible'; visible: boolean }
  | { type: 'asset-result'; id: number; data: ArrayBuffer }
  | { type: 'asset-error'; id: number; message: string };

/** Messages the renderer worker sends to the host. */
export type RendererToHost =
  | { type: 'booted' }
  | { type: 'ready' }
  | { type: 'post'; data: unknown }
  | { type: 'read-asset'; id: number; path: string }
  | { type: 'error'; message: string };

/** The slice of a worker global the protocol needs. */
export interface RendererPort {
  postMessage(message: RendererToHost, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (ev: { data: HostToRenderer }) => void): void;
  requestAnimationFrame?: (cb: (now: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
}

/** Longest frame step handed to onFrame, in seconds. */
export const MAX_FRAME_DT = 0.1;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function runRenderer(start: (ctx: RendererContext) => void | Promise<void>, port: RendererPort): void {
  const propsCbs: Array<(p: Record<string, unknown>) => void> = [];
  const resizeCbs: Array<(s: RendererSize) => void> = [];
  const pointerCbs: Array<(e: CanvasPointerEvent) => void> = [];
  const frameCbs: Array<(dt: number, now: number) => void> = [];
  const visibilityCbs: Array<(v: boolean) => void> = [];
  const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }>();
  let nextAssetId = 1;
  let started = false;
  let visible = true;
  let canvas: OffscreenCanvas | null = null;
  let size: RendererSize = { width: 0, height: 0, pixelRatio: 1 };
  let props: Record<string, unknown> = {};
  let raf = 0;
  let last = 0;

  const report = (e: unknown) => port.postMessage({ type: 'error', message: errorMessage(e) });
  const safe = <A extends unknown[]>(cbs: Array<(...a: A) => void>, ...args: A) => {
    for (const cb of cbs) {
      try { cb(...args); } catch (e) { report(e); }
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (!visible || frameCbs.length === 0) return;
    const dt = last === 0 ? 0 : Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    safe(frameCbs, dt, now);
    schedule();
  };
  const schedule = () => {
    if (raf !== 0 || !visible || !started || frameCbs.length === 0) return;
    const request = port.requestAnimationFrame ?? ((cb: (now: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number);
    raf = request(tick);
  };
  const stopFrames = () => {
    if (raf === 0) return;
    if (port.cancelAnimationFrame) port.cancelAnimationFrame(raf); else clearTimeout(raf);
    raf = 0;
  };

  const ctx: RendererContext = {
    get canvas() { return canvas as OffscreenCanvas; },
    get size() { return size; },
    get props() { return props; },
    readAsset(path) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const id = nextAssetId++;
        pending.set(id, { resolve, reject });
        port.postMessage({ type: 'read-asset', id, path });
      });
    },
    post(data) { port.postMessage({ type: 'post', data }); },
    onProps(cb) { propsCbs.push(cb); },
    onResize(cb) { resizeCbs.push(cb); },
    onPointer(cb) { pointerCbs.push(cb); },
    onFrame(cb) { frameCbs.push(cb); schedule(); },
    onVisibility(cb) { visibilityCbs.push(cb); },
    ready() { port.postMessage({ type: 'ready' }); },
  };

  const applySize = (next: RendererSize) => {
    size = next;
    if (canvas) {
      canvas.width = Math.max(1, Math.round(next.width * next.pixelRatio));
      canvas.height = Math.max(1, Math.round(next.height * next.pixelRatio));
    }
  };

  port.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'init': {
        if (started) return;
        started = true;
        canvas = m.canvas;
        props = m.props;
        visible = m.visible;
        applySize(m.size);
        try {
          void Promise.resolve(start(ctx)).then(schedule, report);
        } catch (e) {
          report(e);
        }
        return;
      }
      case 'props':
        props = m.props;
        safe(propsCbs, props);
        return;
      case 'resize':
        applySize(m.size);
        safe(resizeCbs, size);
        return;
      case 'pointer':
        safe(pointerCbs, m.event);
        return;
      case 'visible': {
        if (m.visible === visible) return;
        visible = m.visible;
        if (visible) { last = 0; schedule(); } else stopFrames();
        safe(visibilityCbs, visible);
        return;
      }
      case 'asset-result': {
        const slot = pending.get(m.id);
        if (!slot) return;
        pending.delete(m.id);
        slot.resolve(m.data);
        return;
      }
      case 'asset-error': {
        const slot = pending.get(m.id);
        if (!slot) return;
        pending.delete(m.id);
        slot.reject(new Error(m.message));
        return;
      }
    }
  });

  port.postMessage({ type: 'booted' });
}
