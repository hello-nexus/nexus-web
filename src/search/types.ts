import type { ReactNode } from 'react';
import type { Language, ThemeMode } from '../lib/settings';

// Groups order = the order they render in. Keep in sync with GROUP_ORDER /
// GROUP_LABEL_KEYS in CommandPalette.tsx.
export type CommandGroup =
  | 'compute'
  | 'navigate'
  | 'devices'
  | 'settings'
  | 'appearance'
  | 'actions';

export interface PaletteDevice {
  key: string;
  name: string;
  subtitle: string;
  iconSrc: string;
}

export interface CommandSettingsPatch {
  themeMode?: ThemeMode;
  accentColor?: string;
  language?: Language;
}

/** App-level capabilities a provider entry can invoke. Supplied by the host
 *  (Dashboard) so the search module stays decoupled from routing internals. */
export interface CommandHost {
  /** Navigate to a /system view (optionally a subtab). */
  goView: (view: string, subtab?: string | null) => void;
  /** Navigate to a top-level section (builder/benchmark/community). */
  goSection: (section: string) => void;
  /** Open the pair-phone modal. */
  pairPhone: () => void;
}

/** Everything a provider needs to build its entries. Assembled once per open
 *  by the palette from live hooks; passed to every provider. */
export interface CommandContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  devices: PaletteDevice[];
  settings: { themeMode: ThemeMode; accentColor: string; language: Language };
  updateSettings: (patch: CommandSettingsPatch) => void;
  host: CommandHost;
  /** Close the palette. Most entries don't need this — the palette closes
   *  itself after run() unless the entry sets keepOpen. */
  close: () => void;
}

export interface SearchEntry {
  id: string;
  title: string;
  subtitle?: string;
  group: CommandGroup;
  icon?: ReactNode;
  /** Extra match targets that don't show in the label (synonyms, related terms). */
  keywords?: string[];
  /** Right-aligned secondary text: a value, shortcut, or live status. */
  hint?: string;
  /** Perform the action. The palette closes afterwards unless keepOpen. */
  run: () => void;
  /** Keep the palette open after running — for live toggles the user may
   *  flip repeatedly (theme, accent, language). */
  keepOpen?: boolean;
}

export interface SearchProvider {
  id: string;
  entries: (ctx: CommandContext) => SearchEntry[];
}
