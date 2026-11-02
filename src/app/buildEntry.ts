// Build is a dedicated sidebar row, not a pinnable app: the row, the Build
// widget tile and the search entry all read the one icon here, so swapping
// the glyph is a one-line change.

import { BuildIcon } from '../components/common/BuildLogo/BuildIcon';

export const BUILD_APP_KEY = 'build' as const;
export const BUILD_ICON = BuildIcon;
export const BUILD_I18N_KEY = 'panel.widget.build';

// Fixed row slot: right after Diagnostics, falling back to the end of the
// feature-pillar rows that are pinned, then the top of the tail.
const PILLAR_KEYS = ['monitoring', 'lighting', 'cooling', 'diagnostics'] as const;

export function withBuildRow(tail: readonly string[]): string[] {
  const rest = tail.filter(k => k !== BUILD_APP_KEY);
  let at = 0;
  for (const key of PILLAR_KEYS) {
    const i = rest.indexOf(key);
    if (i >= 0) at = i + 1;
  }
  return [...rest.slice(0, at), BUILD_APP_KEY, ...rest.slice(at)];
}

// Normalizes a drop result from the sortable sidebar. Build rides in the list
// as a fixed row but is never persisted: it is stripped from both zones, so a
// row dropped on either side of it keeps its place relative to the other apps
// and Build is re-slotted by withBuildRow.
export function stripBuildFromArrangement(next: { pinned: readonly string[]; lower: readonly string[] }): { pinned: string[]; lower: string[] } {
  return {
    pinned: next.pinned.filter(k => k !== BUILD_APP_KEY),
    lower: next.lower.filter(k => k !== BUILD_APP_KEY),
  };
}

// Inserts a dragged-in app at a rendered-row index (which counts the Build
// row) and returns the persisted tail without Build.
export function pinAtRenderedIndex(tail: readonly string[], key: string, renderedIndex: number): string[] {
  const rows = withBuildRow(tail);
  rows.splice(Math.max(0, Math.min(renderedIndex, rows.length)), 0, key);
  return rows.filter(k => k !== BUILD_APP_KEY);
}
