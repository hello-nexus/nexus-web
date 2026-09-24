import { useFocus } from '../../hooks/useFocus';
import type { FocusStatus } from '../../api/focus';
import type { PanelThemeState } from '../theme/panelTheme';
import type { PanelSurface } from '../types';

// Surfaces this PC renders (kiosks and streamed LCDs); Q-series and phones draw themselves.
const HOST_RENDERED_SURFACES: ReadonlySet<PanelSurface> = new Set<PanelSurface>([
  'y70', 'monitor', 'kraken', 'lcd-round', 'lcd-square', 'lcd-wide',
]);

/** Name of the active focus mode when it asks this surface for its solid background, else null. */
export function focusStaticBackgroundMode(status: FocusStatus | null, surface: PanelSurface): string | null {
  if (!status?.activeModeId || !HOST_RENDERED_SURFACES.has(surface)) return null;
  const mode = status.modes.find(m => m.id === status.activeModeId);
  return mode?.staticPanelBackgrounds ? mode.name : null;
}

/** Whether a background redraws every frame: a shader, animated media, or a slideshow. */
export function panelBackgroundAnimates(theme: Pick<PanelThemeState, 'backgroundMode' | 'backgroundMediaType' | 'backgroundSlideshow'>): boolean {
  return theme.backgroundMode === 'shader'
    || (theme.backgroundMode === 'media' && (theme.backgroundMediaType === 'animated' || theme.backgroundSlideshow));
}

/** The theme with an animated background swapped for the default solid of the resolved light/dark theme; still backgrounds are kept. */
export function withStaticBackground(theme: PanelThemeState): PanelThemeState {
  return panelBackgroundAnimates(theme)
    ? { ...theme, backgroundMode: 'solid', backgroundColor: '', backgroundColorLight: '' }
    : theme;
}

/** Live {@link focusStaticBackgroundMode} for a real panel (not a preview). */
export function useFocusStaticBackground(surface: PanelSurface, enabled: boolean): string | null {
  const { status } = useFocus(enabled && HOST_RENDERED_SURFACES.has(surface));
  return focusStaticBackgroundMode(status, surface);
}
