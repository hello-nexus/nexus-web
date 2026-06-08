// Standalone harness that mounts SandboxedWidget(s), for real-browser e2e + perf.
// Reads the widget bundle URL + cell size from the query. No StrictMode (its
// double-invoke would spawn two workers per mount).
//
// blob=1 mirrors the real panel path: fetch widget.mjs as bytes -> blob: URL ->
// worker imports the blob (this is how remote panels load the bundle).

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SandboxedWidget } from '../../src/sandbox/SandboxedWidget';
import { setForceLanMode } from '../../src/api/service';

// The harness runs on a non-service port (so isRemoteOrigin is true) but fakes
// the service at its own origin. forceLanMode makes the relay-aware service
// client direct-fetch resolveHttp() (the harness mock) instead of the relay.
setForceLanMode(true);

const params = new URLSearchParams(location.search);
const entry = params.get('entry') ?? '';
const widgetId = params.get('id') ?? 'harness.widget';
const w = Number(params.get('w') ?? 220);
const h = Number(params.get('h') ?? 220);
const useBlob = params.get('blob') === '1';
const absEntry = entry ? new URL(entry, location.origin).toString() : '';
let settings: Record<string, unknown> = {};
try { settings = JSON.parse(params.get('s') ?? '{}'); } catch { settings = {}; }
const netFetch = (params.get('nf') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const n = Math.max(1, Number(params.get('n') ?? 1));

function Cell({ index }: { index: number }) {
  const [url, setUrl] = useState<string | null>(useBlob ? null : absEntry);
  useEffect(() => {
    if (!useBlob) return;
    let revoke: string | null = null;
    let alive = true;
    void fetch(absEntry).then((r) => r.text()).then((src) => {
      if (!alive) return;
      const u = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      revoke = u;
      setUrl(u);
    });
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, []);
  return (
    <div className="cell" style={{ width: w, height: h }}>
      {url ? (
        <SandboxedWidget entryUrl={url} widgetId={widgetId} instanceId={`harness-${index}`} settings={settings} netFetch={netFetch} />
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12 }}>
    {Array.from({ length: n }, (_, i) => <Cell key={i} index={i} />)}
  </div>,
);

(window as unknown as { __harnessReady: boolean }).__harnessReady = true;
