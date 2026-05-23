// Parent-side wrapper that hosts the real /panel runtime in an iframe.
// Replaces the in-process PanelPreview - by mounting PanelApp itself, the
// simulator inherits drag, paging, edge-advance dwell, swap-or-place, and
// every other runtime behavior with no duplicated stripped-down logic.
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
  // Device DPI. Used to convert native canvas dimensions into the
  // CSS-pixel viewport the real device exposes to its WebView so the
  // simulator iframe reproduces the same `--panel-cell-size` math
  // (e.g. Q60 native 720x1280 @ DPI 240 → CSS viewport 480x853 with
  // DPR 1.5). Without this conversion the hardcoded q60 cellScaler
  // multiplier (--_s: 2.5, baked for a 480-wide CSS viewport)
  // shrinks widget content by ~33% inside the simulator.
  canvasDpi?: number;
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
};

function findWidget(layout: PanelLayout, id: string): PanelWidget | undefined {
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === id);
    if (w) return w;
  }
  return layout.dock?.widgets.find(w => w.id === id);
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
  brightness,
  screenOn,
  showPanel,
}: PanelEmbedFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [childReady, setChildReady] = useState(false);
  // Last layout structurally echoed from the child, serialized. We can't
  // use reference equality - the parent's onLayoutChange runs through
  // normalizePanelLayout which always allocates a new reference even for
  // logically identical content, so a ref-based guard would let the
  // re-emit race with the child's in-flight drag and cancel its
  // animation. JSON.stringify is cheap on PanelLayout (small object) and
  // gives us structural equality.
  const lastSyncedLayoutSerializedRef = useRef<string | null>(null);
  // Fit-to-container scale: the iframe is rendered at CSS-pixel
  // canvas dimensions (native / DPR) so the panel runtime inside the
  // iframe sees the same viewport size as the real device's WebView.
  // It's then transform-scaled to fit the parent's height — same
  // visible footprint as before, but cell-size math inside the panel
  // app now reproduces the hardware's value exactly, so hardcoded
  // per-surface scaling tokens (e.g. Q60's --_s: 2.5 in
  // PanelApp.module.scss) match what they were designed for.
  const nativeW = canvasSize?.width ?? DEFAULT_CANVAS_W;
  const nativeH = canvasSize?.height ?? DEFAULT_CANVAS_H;
  const dpr = SURFACE_DPR[surface] ?? (canvasDpi ? canvasDpi / 160 : 1);
  const canvasW = Math.round(nativeW / dpr);
  const canvasH = Math.round(nativeH / dpr);
  const aspect = canvasW / canvasH;
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
        const availH = entry.contentRect.height;
        const fitW = Math.round(availH * aspect);
        const fitScale = availH / canvasH;
        setMeasured({ w: fitW, h: Math.round(availH), scale: fitScale });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect, canvasH]);

  const post = useCallback((message: SimulatorParentToChild) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    // Iframe is always same-origin (served from the same Vite/service
    // host as the parent), so pin the target to window.location.origin
    // instead of '*' — defence-in-depth if the runtime ever cross-mounts.
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
    // Initial init only - subsequent changes flow through the per-prop
    // effects below. Listing every dependency would re-init on every
    // change and reset the iframe's local UI state (open menus, in-flight
    // motion, etc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childReady]);

  // Layout changes from the parent are mirrored to the iframe except
  // when the structural content already matches what the iframe last
  // emitted - that means the change is just the parent's normalization
  // round-trip of the iframe's own drag echo. Without this skip a
  // setLayout from onLayoutChange would post a new reference back and
  // cancel the animation the iframe is running for the same drag.
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
