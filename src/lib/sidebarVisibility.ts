/** The device fields the sidebar visibility rule reads. */
export interface SidebarVisibilityDevice {
  key: string;
  supportsNexusControl: boolean;
  nexusControlEnabled: boolean;
}

/** A row can be hidden only while its Nexus Control is off. */
export function canHideFromSidebar(device: SidebarVisibilityDevice): boolean {
  return device.supportsNexusControl && !device.nexusControlEnabled;
}

/** Omitted from the sidebar iff in the hidden set AND Nexus Control is off. */
export function isListedInSidebar(device: SidebarVisibilityDevice, hidden: readonly string[]): boolean {
  return !(canHideFromSidebar(device) && hidden.includes(device.key));
}

/** The hidden set with `key` added or removed; the same array when nothing changes. */
export function withSidebarHidden(hidden: readonly string[], key: string, hide: boolean): readonly string[] {
  const has = hidden.includes(key);
  if (hide === has) return hidden;
  return hide ? [...hidden, key] : hidden.filter(k => k !== key);
}
