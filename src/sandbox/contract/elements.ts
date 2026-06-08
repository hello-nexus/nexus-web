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
// this map renders nothing — that is the structural visual-consistency boundary.

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
  // --- interactive (events flow host -> worker) ---
  'ui-slider': {
    properties: ['value', 'min', 'max', 'step', 'tone', 'label', 'disabled'],
    events: ['input', 'change'],
  },
  'ui-button': {
    properties: ['label', 'tone', 'variant', 'disabled', 'icon', 'size'],
    events: ['press'],
  },
  'ui-stepper': {
    properties: ['value', 'min', 'max', 'step', 'label', 'disabled'],
    events: ['change'],
  },
} as const satisfies Record<string, UiElementSpec>;

export type UiElementName = keyof typeof UI_ELEMENTS;

export const UI_ELEMENT_NAMES = Object.keys(UI_ELEMENTS) as UiElementName[];

/** Semantic colour tokens an author may name; the host maps them to CSS vars.
 *  No raw colour/CSS literals cross the boundary — this keeps theming central. */
export const UI_TONES = [
  'text', 'text-dim', 'text-faded', 'accent', 'accent-deep', 'accent-glow',
  'good', 'warn', 'bad', 'border', 'bg-card', 'currentColor',
] as const;
export type UiTone = (typeof UI_TONES)[number];

export const SDK_PROTOCOL_VERSION = 1;
