// Standalone harness that mounts a single SandboxedWidget, for real-browser e2e
// + perf measurement. Reads the widget bundle URL + cell size from the query.
// No StrictMode: its double-invoke would spawn two workers per mount.

import { createRoot } from 'react-dom/client';
import { SandboxedWidget } from '../../src/sandbox/SandboxedWidget';

const params = new URLSearchParams(location.search);
const entry = params.get('entry') ?? '';
const widgetId = params.get('id') ?? 'harness.widget';
const w = Number(params.get('w') ?? 220);
const h = Number(params.get('h') ?? 220);
const absEntry = entry ? new URL(entry, location.origin).toString() : '';
let settings: Record<string, unknown> = {};
try { settings = JSON.parse(params.get('s') ?? '{}'); } catch { settings = {}; }
const netFetch = (params.get('nf') ?? '').split(',').map((x) => x.trim()).filter(Boolean);

const n = Math.max(1, Number(params.get('n') ?? 1));
const root = createRoot(document.getElementById('root')!);
root.render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12 }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="cell" style={{ width: w, height: h }}>
        <SandboxedWidget entryUrl={absEntry} widgetId={widgetId} instanceId={`harness-${i}`} settings={settings} netFetch={netFetch} />
      </div>
    ))}
  </div>,
);

// Signal readiness for perf timing in the spec.
(window as unknown as { __harnessReady: boolean }).__harnessReady = true;
