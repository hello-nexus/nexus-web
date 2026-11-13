import { createContext, useContext, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

export type PanelSkinAttributes = Readonly<Record<string, string>>;

export interface PanelSkinScopeValue {
  attrs: PanelSkinAttributes;
  style: CSSProperties;
}

interface ScopeContext {
  attrs: PanelSkinAttributes;
  host: HTMLElement | null;
}

const NO_ATTRS: PanelSkinAttributes = {};
const SkinContext = createContext<ScopeContext | null>(null);

/** Attributes a panel-root mount spreads so its subtree takes the active skin; empty with no skin. */
export const usePanelSkinAttrs = (): PanelSkinAttributes => useContext(SkinContext)?.attrs ?? NO_ATTRS;

/** The body-level host for portaled chrome opened inside a skinned panel; null otherwise. */
export const useSkinPortalHost = (): HTMLElement | null => useContext(SkinContext)?.host ?? null;

/** Skin attributes for every panel-root mount plus one body-level host mirroring them for portaled chrome; a null scope creates nothing. */
export function PanelSkinScope({ scope, children }: { scope: PanelSkinScopeValue | null; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const active = scope !== null;
  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = document.createElement('div');
    el.className = 'panel-root';
    el.style.display = 'contents';
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [active]);
  useLayoutEffect(() => {
    if (!host || !scope) return;
    for (const name of host.getAttributeNames()) {
      if (name.startsWith('data-')) host.removeAttribute(name);
    }
    for (const [name, value] of Object.entries(scope.attrs)) host.setAttribute(name, value);
    host.removeAttribute('style');
    host.style.display = 'contents';
    for (const [name, value] of Object.entries(scope.style)) {
      if (name.startsWith('--')) host.style.setProperty(name, String(value));
    }
  }, [host, scope]);
  const value = useMemo<ScopeContext | null>(() => (scope ? { attrs: scope.attrs, host } : null), [scope, host]);
  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}
