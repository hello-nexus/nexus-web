// Shared element contract for the sandboxed widget SDK.
//
// This is the single source of truth shared across the two build contexts:
//   - the host (React 19, src/sandbox) imports it to build the element->component
//     map and to assert no drift.
//   - the worker SDK build (react@18, ../../sdk) imports it (relative path) to
//     define the @remote-dom RemoteElement classes authors render.
//
// It is deliberately React-agnostic and contains only data, so both contexts
// can consume it without pulling in either React version. The host renders ONLY
// the element names listed here; an element the worker invents that is not in
// this map renders nothing - that is the structural visual-consistency boundary.

export interface UiElementSpec {
  /** Property names synchronized worker -> host (passed through as props). */
  readonly properties: readonly string[];
  /** Event names the host fires back into the worker (author onX handlers). */
  readonly events?: readonly string[];
}

// Element names are namespaced `ui-*` so they never collide with real HTML tags
// in the worker's polyfilled DOM or the host tree.
export const UI_ELEMENTS = {
  // --- layout ---
  'ui-stack': {
    properties: ['direction', 'gap', 'align', 'justify', 'padding', 'wrap', 'grow', 'flex'],
  },
  'ui-grid': {
    properties: ['columns', 'rows', 'gap', 'padding', 'align', 'justify', 'grow'],
  },
  'ui-frame': {
    properties: ['padding', 'gap', 'direction', 'align', 'justify', 'tone', 'radius', 'border', 'grow'],
  },
  'ui-spacer': { properties: ['size'] },
  'ui-divider': { properties: ['tone'] },
  // --- text ---
  'ui-text': {
    properties: [
      'value', 'tone', 'size', 'weight', 'align', 'transform', 'mono',
      'opacity', 'letterSpacing', 'lineHeight', 'tabular', 'truncate',
    ],
  },
  // --- iconography ---
  'ui-icon': { properties: ['name', 'size', 'tone'] },
  // --- indicators ---
  'ui-ring': { properties: ['value', 'min', 'max', 'label', 'sublabel', 'tone', 'thickness'] },
  'ui-bar': { properties: ['value', 'min', 'max', 'tone', 'label'] },
  // A lo..hi segment positioned within a min..max track (e.g. a day's temp range).
  'ui-range': { properties: ['lo', 'hi', 'min', 'max', 'gradient', 'glow', 'height', 'radius'] },
  'ui-gauge': { properties: ['value', 'min', 'max', 'tone', 'label', 'sublabel'] },
  'ui-sparkline': { properties: ['values', 'min', 'max', 'tone'] },
  // An indeterminate loading spinner (host-drawn SVG). For "loading…" states.
  'ui-spinner': { properties: ['size', 'tone'] },
  // --- interactive (events flow host -> worker) ---
  'ui-slider': {
    properties: ['value', 'min', 'max', 'step', 'tone', 'label', 'disabled', 'trackFill', 'orientation'],
    events: ['input', 'change'],
  },
  'ui-button': {
    properties: ['label', 'tone', 'variant', 'disabled', 'icon', 'size'],
    events: ['press', 'longpress'],
  },
  'ui-stepper': {
    properties: ['value', 'min', 'max', 'step', 'label', 'disabled'],
    events: ['change'],
  },
  // An image from an https/data/blob URL (the host validates the scheme). The
  // worker supplies a URL string; the host owns sizing/fit/radius via tokens.
  'ui-image': { properties: ['src', 'alt', 'fit', 'radius', 'width', 'height', 'aspect', 'tone'] },
  // A scrollable container - the missing primitive for long lists (steam, emoji).
  'ui-scroll': { properties: ['direction', 'gap', 'padding', 'grow'] },
  // Text/number input. `value` is for programmatic sets (reset/compute); typing is
  // local for a smooth cursor and reported via the `input` event. `submit` fires on Enter.
  'ui-input': {
    properties: ['value', 'placeholder', 'type', 'disabled', 'maxLength', 'tone', 'align', 'size', 'mono'],
    events: ['input', 'submit', 'blur'],
  },
  // A multi-series line/area chart (richer than ui-sparkline). The worker passes
  // numeric series; the host draws the SVG, so no raw-SVG escape.
  'ui-chart': { properties: ['series', 'min', 'max', 'height', 'gridlines', 'tone'] },
  // A boolean switch (the native Toggle). `value` is the on/off state; the host
  // fires `change` with the next boolean.
  'ui-toggle': { properties: ['value', 'disabled', 'label'], events: ['change'] },
  // A segmented switcher: one pill per option (the native IconLabelButton), like
  // the clock's design picker. `options` is [{ key, label?, icon? }]; `value` is
  // the active key; the host fires `change` with the chosen key.
  'ui-segmented': { properties: ['options', 'value', 'disabled'], events: ['change'] },
  // The native free-form HSV colour picker (SV square + hue strip + hex field) -
  // the same control lighting uses. `value` is a hex string; the host fires
  // `preview` continuously during a drag and `change` once on commit.
  'ui-color': { properties: ['value'], events: ['preview', 'change'] },
  // A draggable X/Y curve editor (the cooling fan-curve control). `points` is
  // [{x,y}]; axis ranges via xmin/xmax/ymin/ymax. Drag a point to move it,
  // double-click empty space to add, right-click a point to remove; the host
  // fires `change` with the full point array on each edit.
  'ui-curve': {
    properties: ['points', 'xmin', 'xmax', 'ymin', 'ymax', 'tone'],
    events: ['preview', 'change'],
  },
  // --- surfaces / display (presentational, reuse native chrome) ---
  // A standard Card surface. Holds children; optional title/subtitle chrome.
  // When `interactive`, the whole card is pressable and fires `press`.
  'ui-card': { properties: ['title', 'subtitle', 'interactive'], events: ['press', 'longpress'] },
  // A small status pill. `label` text tinted by `tone`; optional leading `icon`.
  'ui-badge': { properties: ['label', 'tone', 'icon'] },
  // Standard empty state (the native EmptyState): icon + title + hint. For
  // "nothing playing" / "no devices" surfaces.
  'ui-empty': { properties: ['title', 'hint', 'icon', 'compact'] },
  // Uppercase section header (the native SectionHeader) for grouping a page.
  'ui-section': { properties: ['title'] },
  // --- blessed composites ---
  // Rich, host-owned widgets the worker can place but not redraw. The host
  // renders the SAME pure presentational component a native widget uses (e.g.
  // ui-worldclock -> the clock widget's WorldClockMap), so there is one
  // implementation, not a sandbox copy. The worker only supplies serializable
  // inputs (an epoch ms tick, a design key); all pixels stay host-side. This is
  // how a bespoke visual (SVG world map, analog face) reaches the SDK without a
  // raw canvas/SVG escape that would break the consistency guarantee.
  // Full day/night world clock page body (map + scrollable city cards). Self-ticks.
  'ui-worldclock': { properties: ['highlightTz'] },
  'ui-clockface': {
    properties: ['nowMs', 'design', 'tz', 'showSeconds', 'showDate', 'hour12', 'useAccentColor', 'size'],
  },
  // Standard page header - gives SDK pages the same title/tab chrome native pages
  // use. `tabs` is [{ key, label, disabled? }]; the host fires `change` with the key.
  'ui-viewheader': {
    properties: ['title', 'tabs', 'activeTab'],
    events: ['change'],
  },
  // Host-mediated file pick + crop + upload. The worker supplies uploadPath and
  // optional crop/size constraints; the host opens a native file picker, runs
  // the picked file through the MediaCropper, then POSTs multipart to uploadPath
  // via postServiceForm (LAN/desktop only - fails closed over the relay tunnel).
  // The host validates uploadPath against the app's manifest mediaImport allowlist
  // before touching the file system or the network.
  'ui-mediaimport': {
    properties: [
      'uploadPath', 'accept', 'aspectRatio',
      'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
      'targetWidth', 'targetHeight', 'label',
    ],
    events: ['progress', 'complete', 'error'],
  },
} as const satisfies Record<string, UiElementSpec>;

export type UiElementName = keyof typeof UI_ELEMENTS;

export const UI_ELEMENT_NAMES = Object.keys(UI_ELEMENTS) as UiElementName[];

/** Semantic colour tokens an author may name; the host maps them to CSS vars.
 *  No raw colour/CSS literals cross the boundary - this keeps theming central. */
export const UI_TONES = [
  'text', 'text-dim', 'text-faded', 'accent', 'accent-deep', 'accent-glow',
  'good', 'warn', 'bad', 'border', 'bg-card', 'currentColor',
] as const;
export type UiTone = (typeof UI_TONES)[number];

export const SDK_PROTOCOL_VERSION = 1;
