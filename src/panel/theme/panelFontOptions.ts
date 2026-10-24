import type { SelectOption } from '../../components/common/Select/Select';
import { PANEL_FONTS, panelFontCssFamily, systemFontFamily, systemFontValue } from './panelFont';

const FALLBACK = 'var(--panel-font)';

interface FontOptionLabels {
  bundled: string;
  system: string;
}

// Embedded faces first. With system families, both groups get a header; the
// current system font is listed even when the host no longer reports it, so
// the picker never loses the stored value.
export function buildPanelFontOptions(
  families: readonly string[] | null,
  current: string | null,
  labels: FontOptionLabels,
): SelectOption[] {
  const bundled: SelectOption[] = PANEL_FONTS.map(f => ({
    value: f.id,
    label: f.family,
    fontFamily: `${panelFontCssFamily(f.id)}, ${FALLBACK}`,
  }));
  const currentFamily = current ? systemFontFamily(current) : null;
  const system = new Set(families ?? []);
  if (currentFamily) system.add(currentFamily);
  if (system.size === 0) return bundled;
  const sorted = [...system].sort((a, b) => a.localeCompare(b));
  return [
    { value: '', label: labels.bundled, header: true },
    ...bundled,
    { value: '', label: labels.system, header: true },
    ...sorted.map(family => ({
      value: systemFontValue(family),
      label: family,
      fontFamily: `${panelFontCssFamily(systemFontValue(family))}, ${FALLBACK}`,
    })),
  ];
}
