import { ZOOM_MAX, ZOOM_MIN, clampZoom } from '../../webview/webViewProtocol';

export { ZOOM_MAX, ZOOM_MIN };
export const ZOOM_STEP = 0.25;
export const REFRESH_CHOICES = [0, 1, 5, 15, 30, 60] as const;

/** Config `zoom`: a number clamped to the zoom range, default 1. */
export function resolveZoom(raw: unknown): number {
  return clampZoom(raw);
}

/** Config `refreshMinutes`: one of the offered choices, else 0 (off). */
export function resolveRefreshMinutes(raw: unknown): number {
  return REFRESH_CHOICES.find(c => c === raw) ?? 0;
}

/** Snaps an edited zoom to the nearest step within the range. */
export function snapZoom(v: number): number {
  return clampZoom(Math.round(v / ZOOM_STEP) * ZOOM_STEP);
}
