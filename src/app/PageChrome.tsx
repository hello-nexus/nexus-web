import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// A page-level settings affordance lifted into the top bar. The page owns its
// own modal + open state; it only hands the top bar a way to open it (plus a
// translated label for the button's tooltip / aria-label).
export interface PageSettingsAction {
  onOpen: () => void;
  label: string;
}

// A page-level simple/advanced mode toggle lifted into the top bar, rendered
// as an icon + full-text button next to the search pill. The page owns its
// mode state (its own ui.*DashboardMode field); it hands the top bar the
// TARGET mode's name (`label`), the action's tooltip (`title`), and the flip.
export interface PageModeToggle {
  onToggle: () => void;
  label: string;
  title: string;
}

interface PageChromeValue {
  settings: PageSettingsAction | null;
  modeToggle: PageModeToggle | null;
  // Stable across renders so a page's registration effect doesn't re-fire when
  // `settings` / `modeToggle` themselves change.
  register: (action: PageSettingsAction | null) => void;
  registerModeToggle: (toggle: PageModeToggle | null) => void;
}

const PageChromeContext = createContext<PageChromeValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PageSettingsAction | null>(null);
  const [modeToggle, setModeToggle] = useState<PageModeToggle | null>(null);
  const register = useCallback((action: PageSettingsAction | null) => {
    setSettings(action);
  }, []);
  const registerModeToggle = useCallback((toggle: PageModeToggle | null) => {
    setModeToggle(toggle);
  }, []);
  const value = useMemo(
    () => ({ settings, modeToggle, register, registerModeToggle }),
    [settings, modeToggle, register, registerModeToggle],
  );
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

// Read the registered page-settings action (top bar). Null outside the provider.
export function usePageChrome(): PageChromeValue | null {
  return useContext(PageChromeContext);
}

/**
 * Register the active page's settings action with the top bar. No-ops on any
 * surface that doesn't mount PageChromeProvider (the phone panel never does),
 * so the immersive Pages stay usable there. `onOpen` must be stable (wrap in
 * useCallback) or the registration re-fires every render.
 */
export function usePageSettingsAction(action: PageSettingsAction, enabled = true) {
  const register = usePageChrome()?.register;
  const { onOpen, label } = action;
  useEffect(() => {
    if (!register) return;
    if (!enabled) {
      register(null);
      return;
    }
    register({ onOpen, label });
    return () => register(null);
  }, [register, onOpen, label, enabled]);
}

/**
 * Register the active page's simple/advanced mode toggle with the top bar.
 * Same contract as {@link usePageSettingsAction}: no-op without the provider,
 * and `onToggle` must be stable or the registration re-fires every render.
 */
export function usePageModeToggle(toggle: PageModeToggle, enabled = true) {
  const register = usePageChrome()?.registerModeToggle;
  const { onToggle, label, title } = toggle;
  useEffect(() => {
    if (!register) return;
    if (!enabled) {
      register(null);
      return;
    }
    register({ onToggle, label, title });
    return () => register(null);
  }, [register, onToggle, label, title, enabled]);
}
