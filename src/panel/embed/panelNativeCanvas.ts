import type { PanelSurface } from '../types';

export interface PanelNativeCanvas {
  cssWidth: number;
  cssHeight: number;
  nativeWidth: number;
  nativeHeight: number;
}

// Physical-resolution target for exports and bakes. The Q-series is fixed
// hardware at 720x1280 and its Android WebView already reports physical px in
// cssWidth (dpr is only render density), so it is never multiplied. Other
// surfaces report CSS px: native = css * dpr (liveCanvas pairs with liveDpr,
// previewSize with previewDpr; simulated presets are native px at dpr 1).
export function resolvePanelNativeCanvas(args: {
  surface: PanelSurface;
  liveCanvas?: { width: number; height: number } | null;
  liveDpr?: number | null;
  previewSize?: { width: number; height: number } | null;
  previewDpr?: number | null;
}): PanelNativeCanvas {
  const { surface, liveCanvas, liveDpr, previewSize, previewDpr } = args;
  const cssWidth = liveCanvas?.width ?? previewSize?.width ?? (surface === 'q60' ? 720 : 682);
  const cssHeight = liveCanvas?.height ?? previewSize?.height ?? (surface === 'q60' ? 1280 : 2560);
  const dpr = (liveCanvas ? liveDpr : previewDpr) || 1;
  return {
    cssWidth,
    cssHeight,
    nativeWidth: surface === 'q60' ? 720 : Math.round(cssWidth * dpr),
    nativeHeight: surface === 'q60' ? 1280 : Math.round(cssHeight * dpr),
  };
}
