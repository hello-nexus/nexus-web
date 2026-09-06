// Worker boot module. Runs FIRST inside a Tier 2 widget worker, before
// the dynamic `import()` of the author entry fires. Its job:
//
//   1. Remove every privileged global the worker could otherwise use to
//      reach the network or persist state outside the host's rails.
//   2. Install the typed `nexus.*` API. Each call routes through the host
//      via postMessage; the host applies the policy (allowlist, rate
//      limit, watchdog) and replies.
//   3. Wait for `nexus.welcome` from the host (carries widgetId + settings
//      snapshot + net.fetch allowlist) before resolving `nexus.ready`, so
//      the author entry's `nexus.ready.then(...)` only fires once the
//      runtime is fully configured.
//
// The script is delivered as a string concatenated into the Blob the
// worker is spawned from; the host follows it with a `import("...worker.js")`
// statement that pulls the author entry over the session-scoped URL.
// Authors can use sibling ESM imports because the browser resolves them
// against the entry URL, which already carries the per-session token.

export function workerBootScript(): string {
  return WORKER_BOOT;
}

const WORKER_BOOT = `
"use strict";

// TEMP EXPERIMENT: WeakRef is Chrome 84; the Q60 panel is a Chromium 83
// WebView. @quilted/threads uses a BARE \`new WeakRef(...)\` on the path that
// retains a function passed across the thread boundary - and the host always
// passes api.persistLocal / api.dispatch - so render() threw ReferenceError
// and NO SDK widget could mount on a Q60. FinalizationRegistry is already
// typeof-guarded upstream; WeakRef is not. The shim holds a strong reference
// (no collection), which is correct-but-leaky and fine for a kiosk panel.
if (typeof WeakRef === "undefined") {
  self.WeakRef = function (target) { this._t = target; };
  self.WeakRef.prototype.deref = function () { return this._t; };
}

// Strip privileged globals. The worker can still author with vanilla JS
// (Promises, Math, JSON, setTimeout, structuredClone) but cannot reach
// the network, persist state, or signal cross-tab except through nexus.*.
const _killed = [
  // Network primitives.
  "fetch", "WebSocket", "XMLHttpRequest", "EventSource", "importScripts",
  // Persistence + cross-context channels - block silent storage and any
  // sideband to other workers/tabs hosting the same origin.
  "BroadcastChannel", "MessageChannel", "indexedDB", "caches",
  "SharedArrayBuffer", "Notification",
  // Sandbox escape via a nested worker. The child would inherit a clean
  // fetch + WebSocket surface (CSP worker-src self blob: permits it), so
  // disable the constructors here. createImageBitmap is the canvas-shaped
  // exfil surface; WebAssembly hosts JIT we have no policy on.
  "Worker", "SharedWorker", "ServiceWorker", "createImageBitmap",
  "WebAssembly",
];
for (const name of _killed) {
  try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); }
  catch (_) { /* some are non-configurable; best effort */ }
}
// navigator.sendBeacon is the other beacon-style egress; null it out.
try {
  if (self.navigator && typeof self.navigator.sendBeacon === "function") {
    Object.defineProperty(self.navigator, "sendBeacon", { value: undefined, configurable: false, writable: false });
  }
} catch (_) { /* best effort */ }

let _readyResolve;
let _ready = new Promise((res) => { _readyResolve = res; });
let _widgetId = "";
let _netFetchAllow = [];
let _settings = {};
let _preview = false;
let _rpcId = 1;
let _subId = 1;
const _pending = new Map();
const _settingsListeners = [];
const _sensorSubs = new Map();
let _lastEveryCb = null;

function _post(type, payload) { self.postMessage({ type, payload }); }
function _rpc(type, payload) {
  return new Promise((resolve, reject) => {
    const id = _rpcId++;
    _pending.set(id, { resolve, reject });
    self.postMessage({ type, id, payload });
  });
}

self.addEventListener("message", (ev) => {
  const msg = ev.data || {};
  switch (msg.type) {
    case "nexus.welcome": {
      const p = msg.payload || {};
      _widgetId = p.widgetId || "";
      _netFetchAllow = p.netFetch || [];
      _settings = Object.freeze(Object.assign({}, p.settings || {}));
      _preview = !!p.preview;
      _readyResolve();
      break;
    }
    case "nexus.settings.changed": {
      _settings = Object.freeze(Object.assign({}, msg.payload || {}));
      for (const cb of _settingsListeners) { try { cb(_settings); } catch (_) {} }
      break;
    }
    case "nexus.refresh": {
      // Host asked us to re-run the most recent every() body once.
      if (typeof _lastEveryCb === "function") { try { _lastEveryCb(); } catch (e) { _post("nexus.log", { level: "error", message: String(e && e.message || e) }); } }
      break;
    }
    case "nexus.sensors.reading": {
      const p = msg.payload || {};
      const cb = _sensorSubs.get(p.subscriptionId);
      if (cb) { try { cb(p.reading); } catch (_) {} }
      break;
    }
    case "nexus.reply": {
      const slot = _pending.get(msg.id);
      if (slot) {
        _pending.delete(msg.id);
        if (msg.error) slot.reject(msg.error);
        else slot.resolve(msg.result);
      }
      break;
    }
    case "nexus.error": {
      _post("nexus.log", { level: "error", message: msg.message || "worker error" });
      break;
    }
  }
});

function _parseCadence(c) {
  if (typeof c === "number") return Math.max(30000, c);
  if (typeof c !== "string") return 600000;
  const m = c.match(/^(\\d+)\\s*(ms|s|m|h)$/i);
  if (!m) return 600000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const ms = unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60000 : n * 3600000;
  return Math.max(30000, ms);
}

const nexus = {
  ready: _ready,
  log(level, message, data) { _post("nexus.log", { level, message, data }); },
  publish(payload) { _post("nexus.publish", payload); },
  refresh() { _post("nexus.publish", { __refresh_marker__: Date.now() }); if (typeof _lastEveryCb === "function") try { _lastEveryCb(); } catch (_) {} },
  // Catalog preview render: host I/O is stubbed; imperative authors branch here
  // (the React path uses the SDK's usePreview()).
  get preview() { return _preview; },

  settings: {
    get current() { return _settings; },
    get() { return Promise.resolve(_settings); },
    onChange(cb) {
      if (typeof cb !== "function") return () => {};
      _settingsListeners.push(cb);
      return () => {
        const i = _settingsListeners.indexOf(cb);
        if (i >= 0) _settingsListeners.splice(i, 1);
      };
    },
  },

  sensors: {
    read(id) { return _rpc("nexus.sensors.read", { id }); },
    subscribe(pattern, cb) {
      if (typeof cb !== "function") return Promise.resolve(() => {});
      const id = _subId++;
      _sensorSubs.set(id, cb);
      _post("nexus.sensors.subscribe", { pattern, subscriptionId: id });
      return Promise.resolve(() => {
        _sensorSubs.delete(id);
        _post("nexus.sensors.unsubscribe", { subscriptionId: id });
      });
    },
  },

  net: {
    fetch(url, init) {
      const opts = init || {};
      return _rpc("nexus.net.fetch", {
        url: String(url),
        method: (opts.method || "GET").toUpperCase(),
        headers: opts.headers || {},
        body: opts.body == null ? undefined : (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)),
      }).then((res) => {
        // Mirror the WHATWG Response shape narrowly so authors can use
        // \`await res.json()\` / \`.text()\` / read \`.status\`.
        const r = res || {};
        return {
          ok: r.ok === true,
          status: r.status || 0,
          statusText: r.statusText || "",
          headers: r.headers || {},
          async text() { return r.body ? (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) : ""; },
          async json() { return r.body && typeof r.body === "object" ? r.body : JSON.parse(r.body || "null"); },
        };
      });
    },
  },

  timer: {
    every(cadence, cb) {
      if (typeof cb !== "function") return () => {};
      const ms = _parseCadence(cadence);
      _lastEveryCb = cb;
      try { cb(); } catch (e) { _post("nexus.log", { level: "error", message: String(e && e.message || e) }); }
      const handle = setInterval(() => {
        try { cb(); } catch (e) { _post("nexus.log", { level: "error", message: String(e && e.message || e) }); }
      }, ms);
      return () => { clearInterval(handle); _lastEveryCb = null; };
    },
    timeout(ms, cb) {
      if (typeof cb !== "function") return () => {};
      const handle = setTimeout(() => {
        try { cb(); } catch (e) { _post("nexus.log", { level: "error", message: String(e && e.message || e) }); }
      }, Math.max(0, ms | 0));
      return () => clearTimeout(handle);
    },
  },
};

Object.defineProperty(self, "nexus", { value: nexus, configurable: false, writable: false });
`;
