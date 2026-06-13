import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// A page-level settings affordance lifted into the top bar. The page owns its
// own modal + open state; it only hands the top bar a way to open it (plus a
// translated label for the button's tooltip / aria-label).
export interface PageSettingsAction {
  onOpen: () => void;
  label: string;
}

interface PageChromeValue {
  settings: PageSettingsAction | null;
  // Stable across renders so a page's registration effect doesn't re-fire when
  // `settings` itself changes.
  register: (action: PageSettingsAction | null) => void;
}

const PageChromeContext = createContext<PageChromeValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PageSettingsAction | null>(null);
  const register = useCallback((action: PageSettingsAction | null) => {
    setSettings(action);
  }, []);
  const value = useMemo(() => ({ settings, register }), [settings, register]);
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
