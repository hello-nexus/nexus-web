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
  // Top bar slot a page portals its tab strip into while fullscreen is on, so
  // the page keeps the vertical space it just gained. A portal, not a node in
  // context: these strips carry live values and re-render at meter rate, which
  // through context state would re-render the whole shell that often.
  tabsSlot: HTMLElement | null;
  setTabsSlot: (el: HTMLElement | null) => void;
  // Pages render their own strip only when this is false.
  fullscreen: boolean;
}

const PageChromeContext = createContext<PageChromeValue | null>(null);

export function PageChromeProvider({ children, fullscreen = false }: {
  children: ReactNode;
  fullscreen?: boolean;
}) {
  const [settings, setSettings] = useState<PageSettingsAction | null>(null);
  const [tabsSlot, setTabsSlotState] = useState<HTMLElement | null>(null);
  const register = useCallback((action: PageSettingsAction | null) => {
    setSettings(action);
  }, []);
  const setTabsSlot = useCallback((el: HTMLElement | null) => {
    setTabsSlotState(el);
  }, []);
  const value = useMemo(
    () => ({ settings, register, tabsSlot, setTabsSlot, fullscreen }),
    [settings, register, tabsSlot, setTabsSlot, fullscreen],
  );
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

// Read the registered page chrome. Null outside the provider.
export function usePageChrome(): PageChromeValue | null {
  return useContext(PageChromeContext);
}

/** True while the active page is in fullscreen; false on surfaces with no provider. */
export function useIsFullscreen(): boolean {
  return usePageChrome()?.fullscreen ?? false;
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

/** The top bar's tab slot while fullscreen is on; portal a tab strip into it. Null when there is nowhere to put one. */
export function usePageTabsSlot(): HTMLElement | null {
  const chrome = usePageChrome();
  return chrome?.fullscreen ? chrome.tabsSlot : null;
}
