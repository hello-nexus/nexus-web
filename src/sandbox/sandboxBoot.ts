// Worker boot source for SDK widgets. Reuses the existing declarative boot
// VERBATIM (privileged-global stripping + the nexus.* RPC surface) and appends a
// tiny suffix that captures the transferred UI MessagePort the host sends, then
// imports the author bundle. The SDK UI channel rides that dedicated port; the
// nexus.* data channel stays on the worker's main message port.

import { workerBootScript } from '../widgets/declarative/workerBoot';

// Captured before the author bundle runs so mount() can await the port even if
// the bundle finishes importing before the host's port message is delivered.
const SDK_BOOT_SUFFIX = `
;(function () {
  globalThis.__nexus_ui_port_ready = new Promise(function (resolve) {
    globalThis.__nexus_resolve_ui_port = resolve;
  });
  self.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (d && d.type === 'nexus.ui.port' && ev.ports && ev.ports[0]) {
      globalThis.__nexus_ui_port = ev.ports[0];
      if (globalThis.__nexus_resolve_ui_port) globalThis.__nexus_resolve_ui_port(ev.ports[0]);
    }
  });
})();
`;

export function composeSdkWorkerSource(entryUrl: string): string {
  return `${workerBootScript()}
${SDK_BOOT_SUFFIX}
import(${JSON.stringify(entryUrl)}).catch(function (err) {
  self.postMessage({ type: 'nexus.error', message: String((err && err.message) || err) });
});
`;
}
