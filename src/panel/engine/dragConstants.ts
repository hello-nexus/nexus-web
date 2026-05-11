// Shared with the e2e spec via a pure TS module so the spec doesn't
// pull SCSS / React imports through PanelApp.tsx.

// How long the cursor must dwell at the left/right edge of the
// viewport during a drag before the pager auto-advances by one page.
// The collision detector latches the side as consumed after the
// timer fires, so the user must drift the cursor out of the band
// before another advance can arm.
export const PANEL_EDGE_ADVANCE_DWELL_MS = 600;
