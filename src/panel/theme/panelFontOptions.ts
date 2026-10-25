import type { SelectOption } from '../../components/common/Select/Select';
import { PANEL_FONTS, panelFontCssFamily, systemFontFamily, systemFontValue } from './panelFont';
import type { SystemFontsStatus } from './systemFontsCache';

const FALLBACK = 'var(--panel-font)';

interface FontOptionLabels {
  bundled: string;
  system: string;
  recent: string;
  load: string;
  loading: string;
  empty: string;
}

// The System group; absent entirely for panels that cannot use host fonts.
export interface SystemFontsGroup {
  status: SystemFontsStatus;
  // Null until the list has been loaded.
  families: readonly string[] | null;
  onLoad: () => void;
}

function systemRow(family: string): SelectOption {
  return {
    value: systemFontValue(family),
    label: family,
    fontFamily: `${panelFontCssFamily(systemFontValue(family))}, ${FALLBACK}`,
  };
}

// Embedded faces first. With a System group, every group gets a header. Before
// the list is loaded the System section holds one action row (plus the current
// system font, so the stored value still shows); Recent picks show either way,
// unfiltered until the list can vouch for them, then limited to installed
// families. They also stay in the full list.
export function buildPanelFontOptions(
  system: SystemFontsGroup | null,
  current: string | null,
  labels: FontOptionLabels,
  recent: readonly string[] = [],
): SelectOption[] {
  const bundled: SelectOption[] = PANEL_FONTS.map(f => ({
    value: f.id,
    label: f.family,
    fontFamily: `${panelFontCssFamily(f.id)}, ${FALLBACK}`,
  }));
  if (!system) return bundled;
  const currentFamily = current ? systemFontFamily(current) : null;
  const installed = system.families ? new Set(system.families) : null;
  const recentRows = [...new Set(recent)].filter(f => !installed || installed.has(f));
  const out: SelectOption[] = [{ value: '', label: labels.bundled, header: true }, ...bundled];
  if (recentRows.length > 0) out.push({ value: '', label: labels.recent, header: true }, ...recentRows.map(systemRow));
  out.push({ value: '', label: labels.system, header: true });
  if (installed) {
    const all = new Set(installed);
    if (currentFamily) all.add(currentFamily);
    out.push(...[...all].sort((a, b) => a.localeCompare(b)).map(systemRow));
    return out;
  }
  if (currentFamily && !recentRows.includes(currentFamily)) out.push(systemRow(currentFamily));
  out.push({
    value: '',
    label: system.status === 'empty' ? labels.empty : labels.load,
    onAction: system.onLoad,
    busy: system.status === 'loading',
    busyLabel: labels.loading,
  });
  return out;
}
