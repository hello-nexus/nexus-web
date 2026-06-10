// Catalog preview fixture — fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size; seeds the two
// widget states (display list + brightness values map). Keep in sync with what
// DisplaysWidget renders (see .agents/rules/widget-preview-fixtures.md in the
// master repo).
import type { Display } from '../../../api/displays';

interface DisplaysPreviewData {
  displays: Display[];
  values: Record<string, number>;
}

const DISPLAYS: Display[] = [
  {
    id: 'display-preview-1',
    name: 'Built-in Display',
    manufacturer: 'Nexus',
    model: 'Laptop Panel',
    isInternal: true,
    isDdcCapable: false,
    capabilities: { brightness: true, contrast: false, colorTempPresets: [], inputSources: [], volume: false },
    brightnessControl: {
      supported: true, min: 0, max: 100, current: 72,
      controlPath: 'windows-internal', writeMode: 'coalesced',
      writeCooldownMs: 0, verifyAfterWrite: false, unsupportedReason: '',
    },
  },
  {
    id: 'display-preview-2',
    name: 'Studio Monitor',
    manufacturer: 'Lumin',
    model: 'LX27Q',
    isInternal: false,
    isDdcCapable: true,
    capabilities: { brightness: true, contrast: false, colorTempPresets: [], inputSources: [], volume: false },
    brightnessControl: {
      supported: true, min: 0, max: 100, current: 45,
      controlPath: 'ddc-ci', writeMode: 'coalesced',
      writeCooldownMs: 0, verifyAfterWrite: false, unsupportedReason: '',
    },
  },
];

export const DISPLAYS_PREVIEW: DisplaysPreviewData = {
  displays: DISPLAYS,
  values: { 'display-preview-1': 72, 'display-preview-2': 45 },
};
