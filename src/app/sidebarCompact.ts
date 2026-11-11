// A narrow viewport always forces the compact sidebar; expanding there would
// squeeze page content. Otherwise a manual override wins over auto behavior.
export function resolveSidebarCompact(
  manualOverride: boolean | null,
  viewportNarrow: boolean,
): boolean {
  return viewportNarrow || manualOverride === true;
}
