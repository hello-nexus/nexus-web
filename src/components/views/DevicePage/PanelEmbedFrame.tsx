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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSimulatorMessage,
  SIMULATOR_QUERY_FLAG,
  type SimulatorParentToChild,
  type SimulatorTheme,
} from '../../../panel/embed/simulatorProtocol';
import type { PanelLayout, PanelSurface, PanelWidget } from '../../../panel/types';
import styles from './PanelEmbedFrame.module.scss';

interface PanelEmbedFrameProps {
  surface: PanelSurface;
  layout: PanelLayout;
  theme: SimulatorTheme;
  themeMode: 'dark' | 'light';
  selectedWidgetId: string | null;
  onLayoutChange: (layout: PanelLayout) => void;
  onWidgetClicked: (widget: PanelWidget) => void;
  onBackgroundClicked: () => void;
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
  // CSS-pixel canvases must NOT be divided by the device DPR again — they
  // already ARE the viewport the WebView exposes. Only the native-pixel
  // profile fallback gets the native→CSS /DPR below.
  //
  // Skipping this renders the iframe at viewport/DPR (y70 734/(337/160)≈
  // 349px), below the y70 `@media (min-height:1500px)` breakpoint, so it paints
  // wrong gaps + an under-scaled cellScaler — the iframe looks squished while
  // the on-device panel is fine. The fix is here, NOT in PanelApp.module.scss.
  // See .agents/rules/failure-log.md (2026-05-29).
  canvasIsCssPixels?: boolean;
  brightness: number;
  screenOn: boolean;
  showPanel: boolean;
}

const DEFAULT_CANVAS_W = 682;
const DEFAULT_CANVAS_H = 2560;

// Per-surface device-pixel-ratio used to convert native canvas
// dimensions into CSS-pixel iframe viewport sizes. Matches what the
// real-hardware WebView reports as `window.devicePixelRatio`. Falls
// back to deriving from DPI (Android density convention: 160 DPI = 1
// DPR) when the surface isn't listed here.
const SURFACE_DPR: Record<string, number> = {
  q60: 1.5, // Android System WebView v83 on Q60 hardware
  // Y70 runs Edge on Windows, so its WebView DPR is the Windows display
  // scaling (150% on the bench Y70 → 1.5), NOT the panel's physical DPI.
  // The DPI-derived fallback over-divides (337/160≈2.1), dropping the 2.5K
  // panel below the y70 @media(min-height:1500px) breakpoint. At 1.5 the
  // 2.5K sim renders 455×1707 and the 4K 733×2560, both above it. A real
  // connected Y70 uses canvasIsCssPixels (liveCanvas) and never hits this map.
  y70: 1.5,
};

function findWidget(layout: PanelLayout, id: string): PanelWidget | undefined {
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === id);
    if (w) return w;
  }
  return undefined;
}

export function PanelEmbedFrame({
  surface,
  layout,
  theme,
  themeMode,
  selectedWidgetId,
  onLayoutChange,
  onWidgetClicked,
  onBackgroundClicked,
  canvasSize,
  canvasDpi,
  canvasIsCssPixels,
  brightness,
  screenOn,
  showPanel,
}: PanelEmbedFrameProps) {
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
  // profiles convert native→CSS via the device DPR so the iframe reproduces
  // the WebView's real --panel-cell-size math.
  const dpr = canvasIsCssPixels ? 1 : (SURFACE_DPR[surface] ?? (canvasDpi ? canvasDpi / 160 : 1));
  const canvasW = Math.round(nativeW / dpr);
  const canvasH = Math.round(nativeH / dpr);
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
        // landscape canvases (promoted monitors, wide simulated panels) —
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
      layout,
      theme,
      themeMode,
      selectedWidgetId,
      brightness,
      screenOn,
      showPanel,
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
    post({ type: 'simulator/set-theme', theme, themeMode });
  }, [childReady, theme, themeMode, post]);

  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-selection', widgetId: selectedWidgetId });
  }, [childReady, selectedWidgetId, post]);

  useEffect(() => {
    if (!childReady) return;
    post({ type: 'simulator/set-display', brightness, screenOn, showPanel });
  }, [childReady, brightness, screenOn, showPanel, post]);

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
        title="Panel simulator"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${measured.scale})`,
        }}
      />
    </div>
  );
}
