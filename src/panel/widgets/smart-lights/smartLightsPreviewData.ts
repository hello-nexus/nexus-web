// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: the tile only
// counts total/online. Keep in sync with what SmartLightsWidget renders (see
// .agents/rules/widget-preview-fixtures.md in the master repo).
import type { SmartLight } from '../../../api/smartLights';

export const SMART_LIGHTS_PREVIEW: SmartLight[] = [
  { id: 'preview-light-1', brand: 'hue', name: 'Desk Bar', host: '192.168.1.40', online: true, enabled: true, ledCount: 12 },
  { id: 'preview-light-2', brand: 'hue', name: 'Wall Wash', host: '192.168.1.41', online: true, enabled: true, ledCount: 8 },
  { id: 'preview-light-3', brand: 'wled', name: 'Bias Strip', host: '192.168.1.62', online: false, enabled: true, ledCount: 90 },
];
