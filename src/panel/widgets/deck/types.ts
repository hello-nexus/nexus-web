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
  | { type: 'toggle'; on: DeckAction; off: DeckAction; state?: DeckToggleState };

export type DeckActionType = DeckAction['type'];

export interface DeckSequenceStep {
  action: DeckAction;
  // Two-knob timing: pressMs holds this step's action before release;
  // gapAfterMs idles before the next step.
  pressMs?: number;
  gapAfterMs?: number;
}

export interface DeckSlot {
  icon?: DeckIcon;     // unset → auto icon by action category
  label?: string;      // shown when set (no global toggle); icon shrinks to fit
  color?: string;      // unset → auto color by action category; else override token/hex
  action?: DeckAction; // a slot is an action OR a folder OR empty
  folder?: DeckFolder;
}

export interface DeckFolder {
  slots: DeckSlot[];
}

export interface DeckConfig {
  slots: DeckSlot[];
}
