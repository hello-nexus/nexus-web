// A narrow viewport always forces the compact sidebar; expanding there would
// squeeze page content. At wide widths only a manual collapse (true) applies.
export function resolveSidebarCompact(
  manualOverride: boolean | null,
  viewportNarrow: boolean,
): boolean {
  return viewportNarrow || manualOverride === true;
}
