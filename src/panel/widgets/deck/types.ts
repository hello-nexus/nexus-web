// Deck widget data model. Every shape here is a subtype of PanelConfigValue
// (string | number | boolean | null | arrays | plain objects) so the whole tree
// persists directly under `widget.config.deck`.

export type DeckIconKind = 'lucide' | 'emoji' | 'app';

export interface DeckIcon {
  kind: DeckIconKind;
  // lucide → icon name in DECK_ICONS; emoji → the glyph/text; app → appId.
  value: string;
}

// ── System actions (host control via REST) ──
export type DeckSystemOp =
  | 'volumeUp' | 'volumeDown' | 'volumeSet' | 'muteToggle'
  | 'mediaPlayPause' | 'mediaNext' | 'mediaPrev'
  | 'brightnessUp' | 'brightnessDown' | 'brightnessSet'
  | 'openSettings';

export interface DeckSystemAction {
  op: DeckSystemOp;
  value?: number;       // volumeSet (0..1), brightnessSet (0..100)
  step?: number;        // up/down increments
  displayId?: string;   // brightness*
  source?: string;      // media* (omit → active session)
}

// ── Nexus device control (reuses existing service endpoints) ──
export type DeckNexusOp =
  | 'rgbEffect' | 'rgbScene' | 'lightingBrightness' | 'lightingPower'
  | 'fanProfile' | 'fanSpeed' | 'y70Power' | 'y70Brightness' | 'y70Rotation';

export interface DeckNexusAction {
  op: DeckNexusOp;
  effect?: string;        // rgbEffect
  profileId?: string;     // rgbScene
  profile?: string;       // fanProfile (preset name)
  deviceId?: string;      // lightingPower
  fanId?: string;         // fanSpeed
  value?: number;         // lightingBrightness (0..1), fanSpeed (0..100), y70Brightness (0..100)
  on?: boolean;           // lightingPower, y70Power
  orientation?: string;   // y70Rotation
}

export type DeckToggleStateKind = 'mute' | 'lightingPower' | 'internal';

export interface DeckToggleState {
  kind: DeckToggleStateKind;
  deviceId?: string; // lightingPower
}

// ── Page navigation (Navigation action group) ──
export type DeckPageOp = 'next' | 'prev' | 'goto';

export interface DeckPageAction {
  op: DeckPageOp;
  target?: number; // goto: 0-based page index
}

export type DeckAction =
  | { type: 'launchApp'; appId: string }
  | { type: 'openFile'; path: string }
  | { type: 'openFolder'; path: string }
  | { type: 'openUrl'; url: string }
  | { type: 'system'; action: DeckSystemAction }
  | { type: 'hotkey'; keys: string }
  | { type: 'text'; text: string; paste?: boolean }
  | { type: 'power'; action: 'lock' | 'sleep' | 'shutdown' | 'restart' | 'logout' }
  | { type: 'audioOutput'; deviceId: string }
  | { type: 'audioInput'; deviceId: string }
  | { type: 'nexus'; action: DeckNexusAction }
  | { type: 'sequence'; steps: DeckSequenceStep[] }
  | { type: 'toggle'; on: DeckAction; off: DeckAction; state?: DeckToggleState }
  | { type: 'page'; op: DeckPageOp; target?: number }
  | { type: 'pageIndicator' }
  // Physical-deck-only: the deck's own screen brightness/blank state. No-op
  // on the touch widget (see deckExecutor); a physical Stream Deck's service
  // handler applies these on key press.
  | { type: 'deckBrightness'; op: 'set' | 'up' | 'down'; value?: number; step?: number }
  | { type: 'deckSleep' }
  // Alternates keysA/keysB (same string format as `hotkey`.keys) on
  // successive presses.
  | { type: 'hotkeySwitch'; keysA: string; keysB: string };

export type DeckActionType = DeckAction['type'];

export interface DeckSequenceStep {
  action: DeckAction;
  // Two-knob timing: pressMs holds this step's action before release;
  // gapAfterMs idles before the next step.
  pressMs?: number;
  gapAfterMs?: number;
}

// Per-key title (label) styling. Every field is sparse - unset means "use the
// default" resolved in deckTitleStyle.ts (title hidden by default). `font` is
// one of DECK_TITLE_FONTS' ids, not a raw CSS family, so the persisted value
// stays a plain enum string.
export interface DeckTitleStyle {
  show?: boolean;
  align?: 'top' | 'middle' | 'bottom';
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface DeckSlot {
  icon?: DeckIcon;     // unset → auto icon by action category
  label?: string;      // shown when set (no global toggle); overlays the icon, never shrinks it
  color?: string;      // unset → auto color by action category; else override token/hex
  title?: DeckTitleStyle; // styling for `label`; unset → deckTitleStyle.ts defaults
  action?: DeckAction; // a slot is an action OR a folder OR empty
  folder?: DeckFolder;
}

export interface DeckFolder {
  slots: DeckSlot[];
}

// One page's grid. Folders (DeckFolder) still nest within a page via
// slot.folder; a page is the outer, ordered-list-of-pages axis a deck's
// page-navigation keys move between.
export interface DeckPage {
  slots: DeckSlot[];
}

export interface DeckConfig {
  pages: DeckPage[];
  // Deck-wide default title style seeded onto a key when an action is first
  // assigned to it (see slotForPickerKind). Edited on the Settings tab.
  defaultTitleStyle?: DeckTitleStyle;
}
