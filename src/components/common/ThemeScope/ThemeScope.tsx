import { createContext, useContext, useLayoutEffect, useState, type ReactNode, type Ref } from 'react';

/** Where portaled popovers and menus mount; null means document.body. */
const PortalRootContext = createContext<HTMLElement | null>(null);

export const usePortalRoot = (): HTMLElement => useContext(PortalRootContext) ?? document.body;

// The user accent is set inline on <html>; inherit keeps it through the theme token block.
const ACCENT_INHERIT = {
  '--accent': 'inherit',
  '--accent-glow': 'inherit',
  '--accent-deep': 'inherit',
  '--accent-soft': 'inherit',
  '--accent-glow-shadow': 'inherit',
  '--accent-text': 'inherit',
  '--slider-fill-dim': 'inherit',
} as React.CSSProperties;

const SCOPE_ATTR = 'data-theme';

export interface ThemeScopeProps {
  theme: 'dark' | 'light';
  className?: string;
  scopeRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * Pins its subtree to one theme whatever the app theme is, keeping the user accent.
 * Portaled popovers and menus inside it mount in a body-level sibling scoped the same way.
 */
export function ThemeScope({ theme, className, scopeRef, children }: ThemeScopeProps) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.setAttribute(SCOPE_ATTR, theme);
    el.style.display = 'contents';
    for (const [name, value] of Object.entries(ACCENT_INHERIT)) el.style.setProperty(name, value as string);
    document.body.appendChild(el);
    setPortalRoot(el);
    return () => {
      el.remove();
      setPortalRoot(null);
    };
  }, [theme]);
  return (
    <div ref={scopeRef} className={className} data-theme={theme} style={ACCENT_INHERIT}>
      <PortalRootContext.Provider value={portalRoot}>{children}</PortalRootContext.Provider>
    </div>
  );
}
