import { createContext, useContext } from 'react';
import type { CommandHost } from './types';

export interface PaletteController {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** App capabilities (navigation, pair-phone) the docked search invokes. */
  host: CommandHost;
}

// Split from CommandPaletteProvider so the top bar can read open/close state
// and the host without importing the search UI module.
export const CommandPaletteCtx = createContext<PaletteController | null>(null);

/** Null when no provider is mounted (panel kiosk / iOS) — callers fall back. */
export function useCommandPaletteOptional(): PaletteController | null {
  return useContext(CommandPaletteCtx);
}

export function useCommandPalette(): PaletteController {
  const c = useContext(CommandPaletteCtx);
  if (!c) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return c;
}
