// Worker boot source for SDK widgets. Reuses the shared worker boot
// VERBATIM (privileged-global stripping + the nexus.* RPC surface) and appends a
// tiny suffix that captures the transferred UI MessagePort the host sends, then
// imports the author bundle. The SDK UI channel rides that dedicated port; the
// nexus.* data channel stays on the worker's main message port.

import { workerBootScript } from './workerBoot';

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

export function composeSdkWorkerSource(runtimeUrl: string, entryUrl: string): string {
  // Import the host-shared runtime FIRST (it installs the polyfills, registers the
  // UI elements, and populates globalThis.__nexusRuntime), then the author bundle,
  // whose externalized react / @hellonexus/* imports are shims reading that global.
  return `${workerBootScript()}
${SDK_BOOT_SUFFIX}
(async function () {
  try {
    await import(${JSON.stringify(runtimeUrl)});
    await import(${JSON.stringify(entryUrl)});
  } catch (err) {
    self.postMessage({ type: 'nexus.error', message: String((err && err.message) || err) });
  }
})();
`;
}
