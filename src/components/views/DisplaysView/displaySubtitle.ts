import type { TopologyDisplay } from '../../../api/displays';

/** Manufacturer and model line, or '' when the name already says it all. */
export function displaySubtitle(display: Pick<TopologyDisplay, 'name' | 'manufacturer' | 'model'>): string {
  const parts = [display.manufacturer, display.model].map(p => p.trim()).filter(Boolean);
  const name = display.name.trim().toLowerCase();
  if (parts.every(p => name.includes(p.toLowerCase()))) return '';
  return parts.join(' - ');
}
