// Deck widget data model. Every shape here is a subtype of PanelConfigValue
// (string | number | boolean | null | arrays | plain objects) so the whole tree
// persists directly under `widget.config.deck`.
import type { ScaleMode } from '../monitoring/perfDomain';

export type DeckIconKind = 'lucide' | 'emoji' | 'app' | 'image';

export interface DeckIcon {
  kind: DeckIconKind;
  // lucide → icon name in DECK_ICONS; emoji → the glyph/text; app → appId;
  // image → the uploaded image id (sha256 hex), served from /deck/images/{id}.
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
// Op ids are the stored wire contract and stay as first written; the UI labels
// them Lighting effect / Cooling mode (see panel.settings.deck.nexus.*).
export type DeckNexusOp =
  | 'rgbEffect' | 'lightingBrightness' | 'lightingPreset'
  | 'fanProfile' | 'coolingPreset'
  | 'y70Power' | 'y70Brightness' | 'y70Rotation';

/** rgbEffect targets one of the lighting page's three live modes. */
export type DeckLightingMode = 'animate' | 'gif' | 'screen';

export interface DeckNexusAction {
  op: DeckNexusOp;
  mode?: DeckLightingMode; // rgbEffect; absent = 'animate'
  effect?: string;        // rgbEffect, mode 'animate'
  presetId?: string;      // lightingPreset, coolingPreset
  profile?: string;       // fanProfile: off | silent | balanced | turbo | max | custom
  value?: number;         // lightingBrightness (0..1), y70Brightness (0..100)
  on?: boolean;           // y70Power
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

// ── Live monitoring tile ──
// Every category the monitoring widget's own picker offers, in that picker's
// order (sensorPicker.ts' DEVICE_OPTION_KEYS). Left out: the legacy 'fan',
// which neither picker offers, and 'igpu', which the service-side key render
// cannot resolve (see deckMonitoring.ts). 'network' resolves to the
// NIC-summed aggregate (networkSensors.ts' buildNicNetworkSensors), not the
// widget's per-process sums - that is the only network source nexus-service
// can reproduce for the physical-deck render.
export type DeckMonitoringCategory =
  | 'quick' | 'cpu' | 'gpu' | 'memory' | 'memoryModule' | 'motherboard'
  | 'storage' | 'smart' | 'network' | 'fps'
  | 'battery' | 'cooler' | 'psu' | 'embeddedController';
export type DeckMonitoringStyle = 'line' | 'segments' | 'backdrop' | 'number';
export type DeckMonitoringPress = 'none' | 'taskManager' | 'monitoringPage';

export type DeckAction =
  | { type: 'launchApp'; appId: string }
  | { type: 'openFile'; path: string }
  | { type: 'openFolder'; path: string }
  | { type: 'openUrl'; url: string }
  | { type: 'system'; action: DeckSystemAction }
  | { type: 'hotkey'; keys: string }
  | { type: 'text'; text: string }
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
  | { type: 'hotkeySwitch'; keysA: string; keysB: string }
  // Live sensor tile - rendered server-side on a physical Stream Deck (see
  // DeckMonitoringCell/deckTarget's upload-job skip) and client-side for the
  // touch widget + device-page grid preview. `sensor` is always a concrete
  // HardwareSensor.id, never the 'Temperature' preferred-sensor sentinel.
  // `labelText` set is the Custom-label discriminant (showName still gates
  // visibility): absent + showName true = Auto (sensor name); showName false
  // = Hidden regardless of labelText. `scale: 'fixed'` uses [min, max] as the
  // domain for line/segments/backdrop (an invalid or absent range falls back
  // to adaptive); ignored for the 'number' style.
  | {
      type: 'monitoring';
      category: DeckMonitoringCategory;
      sensor: string;
      style: DeckMonitoringStyle;
      color?: string;
      showName?: boolean;
      press?: DeckMonitoringPress;
      labelText?: string;
      scale?: ScaleMode;
      min?: number;
      max?: number;
    }
  // Live weather tile - same server-side provider as the weather widget
  // (GET /api/weather). Absent lat/lon means auto (server IP geolocation);
  // city/cc are set alongside lat/lon from the same geocode pick, never
  // independently.
  | {
      type: 'weather';
      lat?: number;
      lon?: number;
      city?: string;
      cc?: string;
      units?: 'C' | 'F' | 'auto';
    }
  // Full native audio playback - see the service's AudioFilePlayer. volume is
  // 0-100; absent means the platform default.
  | { type: 'playAudio'; path: string; volume?: number };

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
  color?: string;      // unset → auto color by action category; else override token/hex or 'transparent'
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
