import { createContext, useContext } from 'react';

export interface PaletteController {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

// Split from CommandPaletteProvider so lightweight consumers (the header
// trigger, ViewHeader) import only the context — not the heavy palette module
// (device enumeration, WebHID specs), which would otherwise ride onto every
// page's critical-path chunk via ViewHeader.
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
