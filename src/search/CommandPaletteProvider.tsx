import {
  useCallback, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { Section } from '../hooks/useRoute';
import type { CommandHost } from './types';
import { CommandPaletteCtx, type PaletteController } from './CommandPaletteContext';
import { useSearchAnchorScroller } from './scroll';
import './searchHighlight.css';

interface Props {
  navigate: (section: Section, view?: string | null, subtab?: string | null) => void;
  onPairPhone: () => void;
  children: ReactNode;
}

/**
 * Owns the docked-search open state + the global `/` shortcut (⌘K / Ctrl-K
 * still toggles it as a fallback), and exposes both (plus the app host) via
 * context. The search UI itself lives in the top bar (TopSearch), so this
 * provider renders only its children - mount it near the app root, inside the
 * i18n / settings / service-state providers.
 */
export function CommandPaletteProvider({ navigate, onPairPhone, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  // Deep-link scroll: search results that target an in-page control scroll to +
  // shine it after navigating.
  useSearchAnchorScroller();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsOpen((o) => !o);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        // A literal slash must still type normally in any editable surface.
        const isEditable = active instanceof HTMLElement && (
          active.tagName === 'INPUT'
          || active.tagName === 'TEXTAREA'
          || active.tagName === 'SELECT'
          || active.isContentEditable
        );
        if (isEditable) return;
        e.preventDefault();
        setIsOpen(true);
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
    () => ({ isOpen, open, close, toggle, host }),
    [isOpen, open, close, toggle, host],
  );

  return (
    <CommandPaletteCtx.Provider value={controller}>
      {children}
    </CommandPaletteCtx.Provider>
  );
}
