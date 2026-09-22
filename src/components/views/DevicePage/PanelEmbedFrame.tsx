// Parent-side wrapper that hosts the real /panel runtime in an iframe, so
// the simulator inherits drag, paging, edge-advance dwell, swap-or-place.
//
// State authority: the parent owns layout + theme + selection. It posts
// every change as a 'simulator/set-*' message to the iframe; the iframe
// renders from those props and echoes user actions back as
// 'simulator/layout-changed' / 'simulator/widget-clicked' /
// 'simulator/background-clicked'. Echo loops are avoided by tracking the
// last-received-from-iframe layout and skipping any outbound 'set-layout'
// whose payload reference matches.

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  isSimulatorMessage,
  SIMULATOR_QUERY_FLAG,
  type SimulatorParentToChild,
  type SimulatorTheme,
} from '../../../panel/embed/simulatorProtocol';
import type { PanelLayout, PanelSurface, PanelWidget } from '../../../panel/types';
import { simulatedPanelCssViewport } from '../../../panel/embed/simulatedPanelViewport';
import { useTranslation } from '../../../lib/i18n';
import styles from './PanelEmbedFrame.module.scss';

export interface PanelEmbedFrameHandle {
  /** Rasterize the live panel document to a PNG blob at the given output px. */
  capture(output: { width: number; height: number }): Promise<Blob>;
}

interface PanelEmbedFrameProps {
  surface: PanelSurface;
  captureRef?: Ref<PanelEmbedFrameHandle>;
  layout: PanelLayout;
  theme: SimulatorTheme;
  themeMode: 'dark' | 'light';
  selectedWidgetId: string | null;
  // One-shot flash request for a widget the parent rejected (e.g. a resize
  // that can't fit). The nonce re-fires repeats; null until the first reject.
  flashSignal?: { widgetId: string; nonce: number } | null;
  onLayoutChange: (layout: PanelLayout) => void;
  onWidgetClicked: (widget: PanelWidget) => void;
  onBackgroundClicked: () => void;
  /** Panel device record id. Forwarded to the simulator iframe so it can render media backgrounds. */
  deviceId?: string;
  // Per-device touch capability, forwarded in 'simulator/init'. The preview's
  // drag sensor gates on it (surfaceSupportsTouch); a touch monitor must pass
  // true or the editor can't drag-rearrange its widgets.
  deviceTouch?: boolean;
  // Display-bound record (displayId set), forwarded in 'simulator/init'. The
  // desktop see-through gate needs it or a 'monitor' preview renders the theme
  // background where the device shows the wallpaper.
  displayBound?: boolean;
  canvasSize?: { width: number; height: number };
  // Device DPI. Converts native canvas dimensions into the CSS-pixel
  // viewport the device exposes to its WebView, so the iframe reproduces
  // the same `--panel-cell-size` math (e.g. Q60 native 720x1280 @ DPI 240
  // → CSS viewport 480x853 with DPR 1.5). Without it the hardcoded q60
  // cellScaler (--_s: 2.5, baked for a 480-wide CSS viewport) shrinks
  // widget content by ~33% in the simulator.
  canvasDpi?: number;
  // True when `canvasSize` is already in CSS pixels (kiosk-reported live
  // viewport via capabilities.cssWidth/cssHeight) rather than native device
  // pixels (the per-surface profile in usePanelDevices' WIDGET_PANEL_PROFILES).
  // CSS-pixel canvases must NOT be divided by the device DPR again - they
  // already ARE the viewport the WebView exposes. Only the native-pixel
  // profile fallback gets the native→CSS /DPR below.
  //
  // Skipping this renders the iframe at viewport/DPR (y70 734/(337/160)≈
  // 349px), below the y70 `@media (min-height:1500px)` breakpoint, so it paints
  // wrong gaps + an under-scaled cellScaler - the iframe looks squished while
  // the on-device panel is fine. The fix is here, NOT in PanelApp.module.scss.
  canvasIsCssPixels?: boolean;
  // Device physical density in CSS px (native dpi / device DPR), forwarded in
  // 'simulator/init' so the iframe's grid capacity math matches the on-device
  // runtime (which measures physical px against the native dpi). Absent for
  // surfaces whose density the runtime already estimates correctly.
  gridDpi?: number;
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
}

const DEFAULT_CANVAS_W = 682;
const DEFAULT_CANVAS_H = 2560;

// WebGL canvases (the animated background shader) render without
// preserveDrawingBuffer, so a toDataURL at clone time reads an already
// cleared buffer and captures blank. Snapshot every canvas inside a rAF
// callback - the shader's own rAF draw runs first (its loop re-registers a
// frame ahead), and the buffer stays valid until the frame composites - and
// pin the snapshot as an own-property toDataURL override for the clone pass.
async function snapshotCanvases(doc: Document): Promise<() => void> {
  const win = doc.defaultView;
  if (!win) return () => {};
  const undo: Array<() => void> = [];
  await new Promise<void>((resolve, reject) => {
    // A torn-down iframe (unmount, navigation) never fires the rAF and there
    // is no event for it, so a watchdog bounds the wait; rejecting routes the
    // click into the error toast instead of a stuck busy spinner.
    const watchdog = win.setTimeout(() => reject(new Error('panel frame stopped rendering')), 2000);
    win.requestAnimationFrame(() => {
      win.clearTimeout(watchdog);
      doc.querySelectorAll('canvas').forEach(canvas => {
        try {
          const data = canvas.toDataURL();
          if (data === 'data:,') return;
          Object.defineProperty(canvas, 'toDataURL', { value: () => data, configurable: true });
          undo.push(() => {
            delete (canvas as unknown as { toDataURL?: () => string }).toDataURL;
          });
        } catch {
          // Tainted or zero-sized canvas: keep the default clone behavior.
        }
      });
      resolve();
    });
  });
  return () => undo.forEach(fn => fn());
}

// Writes each SVG descendant's computed style inline (a visual no-op) and
// returns an undo that restores the original style attributes.
function inlineSvgDescendantStyles(doc: Document): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const undo: Array<() => void> = [];
  doc.querySelectorAll('svg').forEach(svg => {
    svg.querySelectorAll<SVGElement>('*').forEach(el => {
      const prev = el.getAttribute('style');
      const computed = win.getComputedStyle(el);
      if (computed.cssText) {
        el.style.cssText = computed.cssText;
      } else {
        for (const name of computed) {
          el.style.setProperty(name, computed.getPropertyValue(name));
        }
      }
      undo.push(() => {
        if (prev === null) el.removeAttribute('style');
        else el.setAttribute('style', prev);
      });
    });
  });
  return () => undo.forEach(fn => fn());
}

// backdrop-filter does not rasterize inside the SVG foreignObject html-to-image
// draws through, so the frosted-glass overlay (data-panel-frost) contributes
// nothing to a capture. The frost sits directly above the full-bleed
// background layers (data-panel-bg-layer), so applying its blur as a plain
// `filter` on those layers - which DOES rasterize - composes the same look.
// The layers are grown slightly so the filter's transparent edge fringe stays
// outside the viewport (the live backdrop-filter clamps at edges instead).
// Returns an undo that restores the layers' inline styles.
function composeFrostForCapture(doc: Document): () => void {
  const win = doc.defaultView;
  const frost = doc.querySelector<HTMLElement>('[data-panel-frost]');
  if (!win || !frost) return () => {};
  const backdrop = win.getComputedStyle(frost).backdropFilter;
  if (!backdrop || backdrop === 'none') return () => {};
  const radius = parseFloat(/blur\((\d+(?:\.\d+)?)px\)/.exec(backdrop)?.[1] ?? '');
  const undo: Array<() => void> = [];
  doc.querySelectorAll<HTMLElement>('[data-panel-bg-layer]').forEach(layer => {
    const prevFilter = layer.style.filter;
    const prevTransform = layer.style.transform;
    layer.style.filter = backdrop;
    if (Number.isFinite(radius) && radius > 0) {
      const grow = 1 + (2 * radius) / Math.max(1, Math.min(layer.clientWidth, layer.clientHeight));
      layer.style.transform = `scale(${grow})`;
    }
    undo.push(() => {
      layer.style.filter = prevFilter;
      layer.style.transform = prevTransform;
    });
  });
  return () => undo.forEach(fn => fn());
}

// html-to-image rasterizes a <video> by drawing it into a canvas sized to its
// padding box (clientWidth), not its content box, so the wake-lock side
// padding on the media background (.backgroundMediaVideo) would rasterize a
// horizontally stretched frame. Returns an undo.
function unpadVideosForCapture(doc: Document): () => void {
  const undo: Array<() => void> = [];
  doc.querySelectorAll<HTMLVideoElement>('[data-panel-bg-layer] video').forEach(video => {
    const prevPadding = video.style.padding;
    const prevMarginLeft = video.style.marginLeft;
    video.style.padding = '0';
    video.style.marginLeft = '0';
    undo.push(() => {
      video.style.padding = prevPadding;
      video.style.marginLeft = prevMarginLeft;
    });
  });
  return () => undo.forEach(fn => fn());
}

function findWidget(layout: PanelLayout, id: string): PanelWidget | undefined {
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === id);
    if (w) return w;
  }
  return undefined;
}

export function PanelEmbedFrame({
  surface,
  captureRef,
  layout,
  theme,
  themeMode,
  selectedWidgetId,
  flashSignal,
  onLayoutChange,
  onWidgetClicked,
  onBackgroundClicked,
  canvasSize,
  canvasDpi,
  canvasIsCssPixels,
  gridDpi,
  brightness,
  screenOn,
  showPanel,
  deviceId,
  deviceTouch,
  displayBound,
}: PanelEmbedFrameProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [childReady, setChildReady] = useState(false);
  // Last layout structurally echoed from the child, serialized. Reference
  // equality won't work: onLayoutChange runs through normalizePanelLayout,
  // which reallocates even for identical content, so a ref guard would
  // re-emit and cancel the child's in-flight drag animation. Structural
  // compare via stringify avoids that.
  const lastSyncedLayoutSerializedRef = useRef<string | null>(null);
  // Fit-to-container scale: the iframe renders at CSS-pixel canvas
  // dimensions (native / DPR) so the panel runtime sees the same viewport
  // size as the device's WebView, then transform-scales to fit the parent's
  // height. Cell-size math reproduces the hardware value, so hardcoded
  // per-surface scaling tokens (e.g. Q60's --_s: 2.5 in PanelApp.module.scss)
  // match.
  const nativeW = canvasSize?.width ?? DEFAULT_CANVAS_W;
  const nativeH = canvasSize?.height ?? DEFAULT_CANVAS_H;
  // CSS-pixel canvases (live kiosk viewport) are used as-is; native-pixel
  // profiles convert native→CSS via simulatedPanelCssViewport - the same
  // helper the editor's capacity math uses, so the iframe grid and the editor
  // grid agree by construction.
  const cssViewport = canvasIsCssPixels
    ? { cssWidth: Math.round(nativeW), cssHeight: Math.round(nativeH), cssDpi: undefined }
    : simulatedPanelCssViewport(surface, nativeW, nativeH, canvasDpi);
  const canvasW = cssViewport.cssWidth;
  const canvasH = cssViewport.cssHeight;
  // Forward the CSS-px density whenever the parent didn't supply one: the
  // child's own estimate (estimateRuntimePanelDpi) reads the HOST's
  // devicePixelRatio inside the iframe, so the simulated grid would vary with
  // the host display. CSS-px canvases (live records) keep the parent-supplied
  // value; their record DPR is unknown here.
  const effectiveGridDpi = gridDpi ?? cssViewport.cssDpi;
  const [measured, setMeasured] = useState({
    w: canvasW * 0.35,
    h: canvasH * 0.35,
    scale: 0.35,
  });

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Fit BOTH axes: height-only fit overflows the stage horizontally on
        // landscape canvases (promoted monitors, wide simulated panels) -
        // portrait panels (Y70/Q60) stay height-bound, wide ones width-bound.
        const availW = entry.contentRect.width;
        const availH = entry.contentRect.height;
        if (availW <= 0 || availH <= 0) continue;
        const fitScale = Math.min(availW / canvasW, availH / canvasH);
        setMeasured({
          w: Math.round(canvasW * fitScale),
          h: Math.round(canvasH * fitScale),
          scale: fitScale,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasW, canvasH]);

  const post = useCallback((message: SimulatorParentToChild) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    // Iframe is same-origin (served from the same Vite/service host), so
    // pin the target to window.location.origin instead of '*'.
    win.postMessage(message, window.location.origin);
  }, []);

  // Rounded before posting: each post re-renders the whole iframe document, and
  // without the round a drawer animation or a window drag would do that every
  // frame for sub-pixel deltas the overlays cannot show.
  const postedPreviewScale = Math.round(measured.scale * 1000) / 1000;

  // 'simulator/ready' is the handshake signal from the child. Until it
  // arrives we cannot post 'simulator/init' (the child's listener may
  // not be wired yet on a brand-new iframe).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!isSimulatorMessage(data)) return;
      switch (data.type) {
        case 'simulator/ready': {
          setChildReady(true);
          break;
        }
        case 'simulator/layout-changed': {
          lastSyncedLayoutSerializedRef.current = JSON.stringify(data.layout);
          onLayoutChange(data.layout);
          break;
        }
        case 'simulator/widget-clicked': {
          const widget = findWidget(layout, data.widgetId);
          if (widget) onWidgetClicked(widget);
          break;
        }
        case 'simulator/background-clicked': {
          onBackgroundClicked();
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [layout, onBackgroundClicked, onLayoutChange, onWidgetClicked]);

  // Init handshake: send the full state once the child says it's ready.
  useEffect(() => {
    if (!childReady) return;
    post({
      type: 'simulator/init',
      surface,
      deviceTouch,
      displayBound,
      dpi: effectiveGridDpi,
      layout,
      theme,
      themeMode,
      selectedWidgetId,
      brightness,
      screenOn,
      showPanel,
      deviceId,
      previewScale: postedPreviewScale,
    });
    lastSyncedLayoutSerializedRef.current = JSON.stringify(layout);
    // Initial init only; subsequent changes flow through the per-prop
    // effects below. Listing every dep would re-init on every change and
    // reset the iframe's local UI state (open menus, in-flight motion).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childReady]);

  // Mirror parent layout changes to the iframe, except when the structural
  // content matches what the iframe last emitted (the change is just the
  // parent's normalization round-trip of the iframe's own drag echo).
  // Skipping it prevents posting a new reference back and cancelling the
  // iframe's in-flight drag animation.
  useEffect(() => {
    if (!childReady) return;
    const serialized = JSON.stringify(layout);
    if (lastSyncedLayoutSerializedRef.current === serialized) return;
    lastSyncedLayoutSerializedRef.current = serialized;
    post({ type: 'simulator/set-layout', layout });
  }, [childReady, layout, post]);

  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-theme', theme, themeMode, deviceId });
  }, [childReady, theme, themeMode, deviceId, post]);

  // The fit scale changes on every container resize, and overlays the preview
  // draws at desktop size divide it back out.
  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-preview-scale', previewScale: postedPreviewScale });
  }, [childReady, postedPreviewScale, post]);

  // Grid density can resolve after the init handshake (the device record
  // fetch races the iframe boot), so mirror it like the other props.
  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-grid', dpi: effectiveGridDpi });
  }, [childReady, effectiveGridDpi, post]);

  // Touch capability can resolve after init the same way (record fetch),
  // so mirror it too - the preview's drag sensor gates on it.
  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-touch', deviceTouch });
  }, [childReady, deviceTouch, post]);

  // displayBound resolves from the same record fetch; the desktop see-through
  // gate in the iframe needs it.
  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-display-bound', displayBound });
  }, [childReady, displayBound, post]);

  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-selection', widgetId: selectedWidgetId });
  }, [childReady, selectedWidgetId, post]);

  // Forward a reject flash to the iframe. Keyed on the nonce so it fires once
  // per reject, not on the initial null or on childReady toggling.
  const flashNonce = flashSignal?.nonce;
  useEffect(() => {
    if (!childReady || !flashSignal) return;
    post({ type: 'simulator/flash-widget', widgetId: flashSignal.widgetId, nonce: flashSignal.nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per nonce
  }, [childReady, flashNonce, post]);

  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-display', brightness, screenOn, showPanel });
  }, [childReady, brightness, screenOn, showPanel, post]);

  // Same-origin iframe, so its document rasterizes directly. The SVG
  // foreignObject render is vector, so drawing at the native output size
  // stays sharp even though the iframe lays out at CSS px. pixelRatio pins
  // to 1: html-to-image multiplies canvasWidth by the HOST devicePixelRatio
  // otherwise, doubling the output on Retina displays.
  const capture = useCallback(async (output: { width: number; height: number }) => {
    // Gate on the handshake: contentDocument.body exists from about:blank
    // onward, so without this a click during iframe boot saves a blank PNG.
    if (!childReady) throw new Error('panel frame not ready');
    const doc = iframeRef.current?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error('panel frame not loaded');
    // Import before touching the live document so the inline-styles window
    // below stays as short as the rasterize itself.
    const { toBlob } = await import('html-to-image');
    let restoreCanvases: (() => void) | null = null;
    let restoreSvg: (() => void) | null = null;
    let restoreFrost: (() => void) | null = null;
    let restoreVideos: (() => void) | null = null;
    try {
      restoreCanvases = await snapshotCanvases(doc);
      // html-to-image deep-clones <svg> subtrees without copying computed
      // styles onto their descendants, so class-styled paths (the monitoring
      // gauges) rasterize with the SVG defaults - black fill, no stroke.
      // Inline the computed styles for the capture, restore after. A widget
      // re-render during the rasterize can slip an un-inlined SVG into the
      // clone; the capture is a one-shot user action, so a retake covers it.
      restoreSvg = inlineSvgDescendantStyles(doc);
      restoreFrost = composeFrostForCapture(doc);
      restoreVideos = unpadVideosForCapture(doc);
      const blob = await toBlob(body, {
        width: canvasW,
        height: canvasH,
        canvasWidth: output.width,
        canvasHeight: output.height,
        pixelRatio: 1,
        // html-to-image memoizes fetched resources for the page session with
        // query params STRIPPED from the cache key, so without this every
        // capture reuses the first wallpaper/media bytes it ever saw - the
        // ?r= revision that refreshes the visible panel never reaches the
        // rasterizer, and different panels' size-specific crops collide on
        // one key. Full-URL keys make the revision param bust it.
        includeQueryParams: true,
      });
      if (!blob) throw new Error('capture produced no image');
      return blob;
    } finally {
      try {
        restoreVideos?.();
      } finally {
        try {
          restoreFrost?.();
        } finally {
          try {
            restoreSvg?.();
          } finally {
            restoreCanvases?.();
          }
        }
      }
    }
  }, [childReady, canvasW, canvasH]);

  useImperativeHandle(captureRef, () => ({ capture }), [capture]);

  const src = `/panel?${SIMULATOR_QUERY_FLAG}=1`;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      data-surface={surface}
      style={{
        width: measured.w,
        height: measured.h,
      }}
    >
      <iframe
        ref={iframeRef}
        className={styles.frame}
        src={src}
        title={t('devices.panels.simulatorFrameTitle')}
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${measured.scale})`,
        }}
      />
    </div>
  );
}
