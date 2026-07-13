import type { ReactNode } from 'react';
import type { UiSettingsValue } from '../hooks/useUiSettings';
import type { SearchLiveState } from './useSearchLiveState';

export interface PaletteDevice {
  key: string;
  name: string;
  subtitle: string;
  iconSrc: string;
  /** Disconnected devices stay findable; their entry says so in the hint. */
  connected: boolean;
}

/** App-level capabilities a provider entry can invoke. Supplied by the host
 *  (Dashboard) so the search module stays decoupled from routing internals. */
export interface CommandHost {
  /** Navigate to a /system view (optionally a subtab). */
  goView: (view: string, subtab?: string | null) => void;
  /** Navigate to a top-level section. */
  goSection: (section: string) => void;
  /** Open the pair-phone modal. */
  pairPhone: () => void;
}

/** Everything a provider needs to build its entries. Assembled once per open
 *  by the palette from live hooks; passed to every provider. */
export interface CommandContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Service reachable - gates entries that write to the device (cooling,
   *  lighting) so they don't show while there's nothing to apply to. */
  online: boolean;
  devices: PaletteDevice[];
  /** User profiles + the active one, so search can switch directly. */
  profiles: { id: string; name: string }[];
  activeProfileId: string;
  switchProfile: (id: string) => void;
  /** The full UI settings, so toggle actions can read current state + flip any key. */
  settings: UiSettingsValue;
  updateSettings: (patch: Partial<UiSettingsValue>) => void;
  /** Live remote-access on/off state, so those become single toggles. */
  panel: { remoteEnabled: boolean; relayEnabled: boolean; wifiEnabled: boolean };
  /** Host OS ('windows' | 'macos' | 'linux' | ''), gating platform-bound
   *  entries the same way their Settings rows gate themselves. */
  platform: string;
  /** Snapshot of stateful service data fetched at palette open. */
  live: SearchLiveState;
  host: CommandHost;
  /** Close the palette. Most entries don't need this - the palette closes
   *  itself after run() unless the entry sets keepOpen. */
  close: () => void;
}

export interface SearchEntry {
  id: string;
  title: string;
  subtitle?: string;
  /** 'navigate' opens a page/section and commits nothing; 'action' applies an
   *  immediate change (theme, cooling preset, lighting effect). Drives the
   *  trailing affordance so the user knows which is which before selecting. */
  kind: 'navigate' | 'action';
  icon?: ReactNode;
  /** Extra match targets that don't show in the label (synonyms, related terms). */
  keywords?: string[];
  /** Right-aligned secondary text: a value, shortcut, or live status. */
  hint?: string;
  /** When set, the entry is an on/off control: the row shows a switch in this
   *  state. Clicking the switch flips it and keeps search open; selecting the
   *  row (Enter / click elsewhere) flips + closes. */
  toggle?: boolean;
  /** Raw setter for a toggle, so repeated in-place flips use the live state. */
  setToggle?: (next: boolean) => void;
  /** Perform the action. The search closes afterwards. */
  run: () => void;
  /** Surface in the empty-state suggestions (the primary destinations). */
  suggest?: boolean;
}

/** A source contributes entries for the current context. The whole catalog is
 *  just an array of these - add one (or a row to a data table it reads) to add
 *  results. Return [] to contribute nothing (e.g. device sources while offline). */
export type SearchSource = (ctx: CommandContext) => SearchEntry[];
