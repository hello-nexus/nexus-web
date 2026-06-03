import {
  Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { Section } from '../hooks/useRoute';
import type { CommandHost } from './types';
import { CommandPaletteCtx, type PaletteController } from './CommandPaletteContext';

// The palette pulls in device enumeration + WebHID specs; load it on first
// open so it never weighs on the initial bundle.
const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

interface Props {
  navigate: (section: Section, view?: string | null, subtab?: string | null) => void;
  onPairPhone: () => void;
  children: ReactNode;
}

/**
 * Mounts the global ⌘K / Ctrl-K search. Provide once near the app root, inside
 * the i18n / settings / service-state providers the palette reads from. Renders
 * the children plus the palette overlay (only while open, lazily loaded).
 */
export function CommandPaletteProvider({ navigate, onPairPhone, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const host = useMemo<CommandHost>(() => ({
    goView: (view, subtab) => navigate('system', view, subtab ?? null),
    goSection: (section) => navigate(section as Section),
    pairPhone: onPairPhone,
  }), [navigate, onPairPhone]);

  const controller = useMemo<PaletteController>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <CommandPaletteCtx.Provider value={controller}>
      {children}
      {isOpen && (
        <Suspense fallback={null}>
          <CommandPalette open onClose={close} host={host} />
        </Suspense>
      )}
    </CommandPaletteCtx.Provider>
  );
}
