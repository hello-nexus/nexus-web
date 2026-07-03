// Pure helpers for the Tryx overlay WYSIWYG editor: font -> CSS mapping,
// panel-to-preview scale math, drag clamping, docked-layout math, and the
// monitoring sensor-picker option lists. Kept free of React/DOM so they are
// unit-testable.

import type { CSSProperties } from 'react';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { bareSensorLabel } from '../../../panel/widgets/monitoring/sensorNames';

// Only the panel canvas's height matters here - every scaled metric below is
// a fraction of it (width plays no part in the font/offset math).
export const TRYX_PANEL_HEIGHT = 1080;
export const TRYX_VALUE_FONT_PANEL_PX = 130;
export const TRYX_LABEL_FONT_PANEL_PX = 52;
export const TRYX_LABEL_OFFSET_PANEL_PX = 150;

/** Clamp a normalized drag coordinate to the on-canvas 0..1 range. */
export function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Fixed device-firmware vocabulary forwarded verbatim to the `/tryx/overlay`
// font field - the wire value the panel firmware parses, not freely
// translatable UI chrome.
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

// ── Alignment ────────────────────────────────────────────────────────────────

export const TRYX_OVERLAY_ALIGNS = ['left', 'center', 'right'] as const;
export type TryxOverlayAlign = (typeof TRYX_OVERLAY_ALIGNS)[number];

export const TRYX_OVERLAY_ALIGN_LABEL_KEYS: Record<TryxOverlayAlign, string> = {
  left: 'devices.tryx.alignLeft',
  center: 'devices.tryx.alignCenter',
  right: 'devices.tryx.alignRight',
};

export function isTryxOverlayAlign(value: unknown): value is TryxOverlayAlign {
  return typeof value === 'string' && (TRYX_OVERLAY_ALIGNS as readonly string[]).includes(value);
}

/** CSS text-justification for a preview stat, matching the panel's own render. */
export function tryxOverlayJustifyStyle(align: TryxOverlayAlign): CSSProperties {
  switch (align) {
    case 'center': return { textAlign: 'center', transform: 'translateX(-50%)' };
    case 'right': return { textAlign: 'right', transform: 'translateX(-100%)' };
    default: return { textAlign: 'left' };
  }
}

// Anchor x per alignment (justification-side inset from the panel edge / center).
const DOCKED_ALIGN_X: Record<TryxOverlayAlign, number> = { left: 0.04, center: 0.5, right: 0.96 };
const DOCKED_Y_START = 0.10;
const DOCKED_Y_STEP = 0.20;

/**
 * Docked-mode anchor for the nth enabled stat (0-based, in stack order): x
 * follows the current text alignment, y stacks the enabled stats evenly.
 */
export function dockedOverlayItemPosition(align: TryxOverlayAlign, indexAmongEnabled: number): { x: number; y: number } {
  return { x: DOCKED_ALIGN_X[align], y: DOCKED_Y_START + indexAmongEnabled * DOCKED_Y_STEP };
}

export interface TryxOverlayLayoutItem {
  enabled: boolean;
  x: number;
  y: number;
}

/**
 * Recomputes x/y for every enabled item from `align`, in slot order. Disabled
 * items are left untouched - they are never sent to the service, so a stale
 * position doesn't matter until the item is re-enabled.
 */
export function applyDockedOverlayLayout<T extends TryxOverlayLayoutItem>(
  items: readonly T[],
  align: TryxOverlayAlign,
): T[] {
  let enabledIndex = 0;
  return items.map(item => {
    if (!item.enabled) return item;
    const pos = dockedOverlayItemPosition(align, enabledIndex);
    enabledIndex += 1;
    return { ...item, x: pos.x, y: pos.y };
  });
}

// ── Sensor picker (monitoring library) ──────────────────────────────────────

export const TRYX_SENSOR_GROUPS = ['cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network'] as const;
export type TryxSensorGroup = (typeof TRYX_SENSOR_GROUPS)[number];

export const TRYX_SENSOR_GROUP_LABEL_KEYS: Record<TryxSensorGroup, string> = {
  cpu: 'devices.tryx.deviceCpu',
  gpu: 'devices.tryx.deviceGpu',
  memory: 'devices.tryx.deviceMemory',
  motherboard: 'devices.tryx.deviceMotherboard',
  storage: 'devices.tryx.deviceStorage',
  network: 'devices.tryx.deviceNetwork',
};

export function isTryxSensorGroup(value: unknown): value is TryxSensorGroup {
  return typeof value === 'string' && (TRYX_SENSOR_GROUPS as readonly string[]).includes(value);
}

export type TryxSensorsByGroup = Readonly<Record<TryxSensorGroup, readonly HardwareSensor[]>>;

export interface TryxSensorOption {
  value: string;
  /** Dropdown row text, disambiguated with the sensor type. */
  optionLabel: string;
  /** Concise label stored on the item and shown on the panel/preview. */
  bareLabel: string;
  type: string;
}

// bareSensorLabel only strips a prefix for cpu/gpu/memory/network (its
// DEVICE_PREFIXES map); motherboard isn't a valid DeviceKey there at all, so
// it's special-cased here rather than passed through as a type error.
function bareLabelForGroup(group: TryxSensorGroup, name: string): string {
  if (group === 'motherboard') return name;
  return bareSensorLabel(group, name) || name;
}

/**
 * Sensor options for one device group, deduped by id - mirrors
 * MonitoringSettings' `sensorsForDevice`.
 */
export function tryxSensorOptionsForGroup(
  group: TryxSensorGroup,
  sensorsByGroup: TryxSensorsByGroup,
): TryxSensorOption[] {
  const seen = new Set<string>();
  const options: TryxSensorOption[] = [];
  for (const s of sensorsByGroup[group] ?? []) {
    if (!s.id || seen.has(s.id)) continue;
    seen.add(s.id);
    const bareLabel = bareLabelForGroup(group, s.name);
    options.push({ value: s.id, bareLabel, type: s.type, optionLabel: `${bareLabel} (${s.type})` });
  }
  return options;
}

// Representative placeholder per sensor type, shown when no live reading is
// available for the picked sensor (e.g. right after picking it, before the
// next websocket frame, or a sensor that has since disappeared).
const SENSOR_TYPE_PLACEHOLDERS: Record<string, string> = {
  Temperature: '45°C',
  Load: '34%',
  Level: '80%',
  Clock: '4.70GHz',
  Frequency: '6000MHz',
  Voltage: '1.25V',
  Power: '65W',
  Fan: '1200RPM',
  Data: '8.2GB',
  SmallData: '512MB',
  Rate: '12.4MB/s',
};

export function tryxSensorPlaceholder(sensorType: string): string {
  return SENSOR_TYPE_PLACEHOLDERS[sensorType] ?? '--';
}

// Mirror the service's TryxPanoramaHub.FormatSensorValue byte-for-byte: the panel
// firmware renders exactly this string, so the preview must round the same way (whole
// numbers for temp/load/clock/power/fan, fixed decimals for voltage/data/throughput)
// rather than the monitoring `formatted` string, which keeps a decimal the panel drops.
export function formatTryxSensorValue(sensorType: string, value: number): string {
  switch (sensorType) {
    case 'Temperature': return `${Math.round(value)}°C`;
    case 'Load': return `${Math.round(value)}%`;
    case 'Clock':
    case 'Frequency': return `${Math.round(value)}MHz`;
    case 'Voltage': return `${value.toFixed(2)}V`;
    case 'Data': return `${value.toFixed(1)}GB`;
    case 'SmallData': return `${Math.round(value)}MB`;
    case 'Power': return `${Math.round(value)}W`;
    case 'Fan': return `${Math.round(value)}RPM`;
    case 'Throughput': return `${value.toFixed(1)}MB/s`;
    default: return String(value);
  }
}

/**
 * Live sensor value formatted exactly as the panel firmware renders it (see
 * {@link formatTryxSensorValue}) if the page currently has the reading, else a
 * type-appropriate placeholder.
 */
export function tryxOverlayPreviewValue(
  device: TryxSensorGroup,
  sensorId: string,
  fallbackType: string,
  sensorsByGroup: TryxSensorsByGroup,
): string {
  const live = (sensorsByGroup[device] ?? []).find(s => s.id === sensorId);
  return live ? formatTryxSensorValue(live.type, live.value) : tryxSensorPlaceholder(fallbackType);
}
