// Native-pixel panel canvas (simulated preset / per-surface hardware profile)
// to the CSS-pixel viewport the device's WebView exposes. PanelEmbedFrame
// sizes the simulator iframe with this, and the editor derives grid capacity
// from it - both sides MUST share this exact math (rounding included) or the
// editor grid drifts from what the iframe renders.

import { panelGridCapacityForCanvas } from '../engine/grid';
import { getPanelGridSizingSettings } from '../../lib/panelSimulation';
import type { PaginateCapacity } from '../engine/paginate';
import type { PanelSurface } from '../types';

// Per-surface device-pixel-ratio used to convert native canvas
// dimensions into CSS-pixel viewport sizes. Matches what the
// real-hardware WebView reports as `window.devicePixelRatio`. Falls
// back to deriving from DPI (Android density convention: 160 DPI = 1
// DPR) when the surface isn't listed here.
export const SURFACE_DPR: Record<string, number> = {
  q60: 1.5, // Android System WebView v83 on Q60 hardware
  // Y70 runs Edge on Windows, so its WebView DPR is the Windows display
  // scaling (150% on the bench Y70 → 1.5), NOT the panel's physical DPI.
  // The DPI-derived fallback over-divides (337/160≈2.1), dropping the 2.5K
  // panel below the y70 @media(min-height:1500px) breakpoint. At 1.5 the
  // 2.5K sim renders 455×1707 and the 4K 733×2560, both above it. A real
  // connected Y70 uses canvasIsCssPixels (liveCanvas) and never hits this map.
  y70: 1.5,
  // Promoted monitors: a real record renders via canvasIsCssPixels and never
  // reads this; simulated presets carry native px, and the DPR is the user's
  // Windows display scaling, which a simulation can't know - assume 100%.
  // The dpi-derived fallback is an Android density convention and would
  // shrink the canvas (see failure-log 2026-05-29).
  monitor: 1,
};

export interface SimulatedPanelCssViewport {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  // Physical density in CSS px (native dpi / dpr); undefined without a
  // native dpi. This is what the iframe's grid math consumes - its DPR is
  // forced to 1, so densities must be pre-converted to CSS space.
  cssDpi?: number;
}

export function simulatedPanelCssViewport(
  surface: PanelSurface,
  nativeWidth: number,
  nativeHeight: number,
  nativeDpi?: number,
): SimulatedPanelCssViewport {
  const dpr = SURFACE_DPR[surface] ?? (nativeDpi ? nativeDpi / 160 : 1);
  return {
    cssWidth: Math.round(nativeWidth / dpr),
    cssHeight: Math.round(nativeHeight / dpr),
    dpr,
    cssDpi: nativeDpi ? nativeDpi / dpr : undefined,
  };
}

// Grid capacity for a simulated panel, computed on the same CSS-space
// viewport (and dev sizing knobs) the simulator iframe measures - equal by
// construction to what the iframe's readRuntimePanelGrid derives.
export function simulatedPanelEditorCapacity(
  surface: PanelSurface,
  nativeWidth: number,
  nativeHeight: number,
  nativeDpi?: number,
  paddingRatio?: number,
): PaginateCapacity {
  const viewport = simulatedPanelCssViewport(surface, nativeWidth, nativeHeight, nativeDpi);
  const capacity = panelGridCapacityForCanvas(viewport.cssWidth, viewport.cssHeight, {
    surface,
    dpi: viewport.cssDpi,
    sizing: getPanelGridSizingSettings(),
    paddingRatio,
  });
  return { gridCols: capacity.columns, pageRows: capacity.rows };
}
