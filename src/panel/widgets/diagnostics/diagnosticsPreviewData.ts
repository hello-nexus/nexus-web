// Catalog preview fixture - fake server payload, untranslated by design. One
// complete snapshot; the widget's own rendering slices it
// (previewMode.test.tsx is the fixture-sync gate). Kept independent of
// diagnosticsMock.ts (the dev-only 404-fallback fixtures) so this
// always-shipped preview data doesn't pull that dev-only module into the
// production bundle.
import type { DiagnosticsHealth } from '../../../api/diagnostics';

export const DIAGNOSTICS_PREVIEW: DiagnosticsHealth = {
  generatedAt: '2026-01-01T00:00:00Z',
  supported: true,
  overall: 'watch',
  components: [
    { id: 'storage:preview', kind: 'storage', name: 'Preview SSD', status: 'ok', reasons: [] },
    { id: 'memory:preview', kind: 'memory', name: 'Preview Memory', status: 'ok', reasons: [] },
    {
      id: 'gpu:preview',
      kind: 'gpu',
      name: 'Preview GPU',
      status: 'watch',
      reasons: [
        {
          code: 'gpu.thermalThrottle',
          severity: 'watch',
          summary: 'Thermal throttling active',
          detail: 'The GPU is currently limiting clocks due to temperature.',
        },
      ],
    },
    { id: 'cooling:preview', kind: 'cooling', name: 'Preview Pump', status: 'ok', reasons: [] },
    { id: 'system:preview', kind: 'system', name: 'Preview System', status: 'ok', reasons: [] },
  ],
};
