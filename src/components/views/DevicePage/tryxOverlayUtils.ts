// Pure helpers for the Tryx overlay WYSIWYG editor: font -> CSS mapping,
// panel-to-preview scale math, drag clamping, and placeholder formatting.
// Kept free of React/DOM so they are unit-testable.

import type { CSSProperties } from 'react';

// Only the panel canvas's height matters here - every scaled metric below is
// a fraction of it (width plays no part in the font/offset math).
export const TRYX_PANEL_HEIGHT = 1080;
export const TRYX_VALUE_FONT_PANEL_PX = 130;
export const TRYX_LABEL_FONT_PANEL_PX = 52;
export const TRYX_LABEL_OFFSET_PANEL_PX = 150;

/** Left-stack default layout when the service reports no overlay items yet. */
export function defaultOverlayItemPosition(index: number): { x: number; y: number } {
  return { x: 0.04, y: 0.12 + index * 0.16 };
}

/** Clamp a normalized drag coordinate to the on-canvas 0..1 range. */
export function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Fixed device-firmware vocabulary forwarded verbatim to the `/tryx/overlay`
// font field - the wire value the panel firmware parses, not freely
// translatable UI chrome (same precedent as TRYX_STATS).
export const TRYX_FONTS = [
  'roboto-regular',
  'roboto-thin',
  'roboto-light',
  'roboto-medium',
  'roboto-bold',
  'roboto-black',
  'roboto-italic',
  'roboto-condensed',
  'monospace',
] as const;

export type TryxOverlayFont = (typeof TRYX_FONTS)[number];

export const TRYX_FONT_LABEL_KEYS: Record<TryxOverlayFont, string> = {
  'roboto-regular': 'devices.tryx.fontRegular',
  'roboto-thin': 'devices.tryx.fontThin',
  'roboto-light': 'devices.tryx.fontLight',
  'roboto-medium': 'devices.tryx.fontMedium',
  'roboto-bold': 'devices.tryx.fontBold',
  'roboto-black': 'devices.tryx.fontBlack',
  'roboto-italic': 'devices.tryx.fontItalic',
  'roboto-condensed': 'devices.tryx.fontCondensed',
  monospace: 'devices.tryx.fontMonospace',
};

/**
 * CSS approximation of a panel font option. The panel firmware renders a
 * bundled Roboto family that isn't shipped to the dashboard, so each variant
 * maps to the closest weight/style on the app's own font stack - positioning
 * and size fidelity matter more than the exact glyph shapes here.
 */
export function tryxFontCssStyle(font: string): CSSProperties {
  switch (font) {
    case 'roboto-thin': return { fontFamily: 'var(--font-sans)', fontWeight: 100 };
    case 'roboto-light': return { fontFamily: 'var(--font-sans)', fontWeight: 300 };
    case 'roboto-medium': return { fontFamily: 'var(--font-sans)', fontWeight: 500 };
    case 'roboto-bold': return { fontFamily: 'var(--font-sans)', fontWeight: 700 };
    case 'roboto-black': return { fontFamily: 'var(--font-sans)', fontWeight: 900 };
    case 'roboto-italic': return { fontFamily: 'var(--font-sans)', fontWeight: 400, fontStyle: 'italic' };
    case 'roboto-condensed': return { fontFamily: 'var(--font-sans)', fontWeight: 400, fontStretch: 'condensed' };
    case 'monospace': return { fontFamily: 'var(--font-mono)', fontWeight: 400 };
    default: return { fontFamily: 'var(--font-sans)', fontWeight: 400 };
  }
}

/**
 * Scales a panel-space pixel metric (against `TRYX_PANEL_HEIGHT`) by the
 * global size percent, into the preview's own pixel space. Mirrors the
 * panel firmware's own layout formula exactly, so the two stay pixel-for-
 * pixel proportional at any preview size.
 */
export function scalePanelMetric(panelPx: number, sizePercent: number, previewHeightPx: number): number {
  return (panelPx * (sizePercent / 100) / TRYX_PANEL_HEIGHT) * previewHeightPx;
}

const STAT_PLACEHOLDERS: Record<string, string> = {
  'CPU Temperature': '45°C',
  'CPU Frequency': '4.7GHz',
  'CPU Usage': '18%',
  'CPU Voltage': '1.25V',
  'GPU Temperature': '52°C',
  'GPU Frequency': '2.4GHz',
  'GPU Usage': '34%',
  'GPU Voltage': '1.05V',
  'Motherboard Temperature': '38°C',
  'Memory Frequency': '6000MHz',
  'Memory Utilization': '42%',
};

/**
 * Representative preview value for a stat. `Date&Time` renders the actual
 * current time (always available, no sensor dependency); every other stat
 * has no live reading on this page, so a plausible placeholder stands in.
 */
export function tryxOverlayStatPlaceholder(stat: string, now: Date = new Date()): string {
  if (stat === 'Date&Time') {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return STAT_PLACEHOLDERS[stat] ?? '--';
}
