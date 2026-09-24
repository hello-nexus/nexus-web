import { useEffect } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';

// Hands the server-backed ui.sidebarCollapsed pref to Dashboard, which owns the
// collapse state but renders the UiSettingsProvider and so cannot read it
// itself. Fires on hydrate, profile switch, and another window's toggle; the
// write side is TopBar's collapse button.
export function SidebarCollapsedSync({ onChange }: { onChange: (collapsed: boolean) => void }) {
  const { settings } = useUiSettings();
  const collapsed = settings.sidebarCollapsed;
  useEffect(() => {
    onChange(collapsed);
  }, [collapsed, onChange]);
  return null;
}
