// Reloads the SPA when a NEW web bundle has been deployed under a long-lived
// client (kiosk WebViews, the desktop dashboard, phone panels) so it picks up
// the freshly deployed hashed entry bundle instead of forever running the one
// it loaded at boot.
//
// Why this is needed: a web-only deploy swaps `wwwroot` WITHOUT changing the
// service version, so a version poll can't see it; and the offline service
// worker is inert on localhost (it never intercepts the local service) and only
// reloads on a manual CACHE_VERSION bump anyway - so neither existing mechanism
// refreshes an already-loaded panel. The vite entry filename (`index-<hash>.js`)
// already changes iff the built code changed, so comparing the served entry
// against the one this document loaded is a precise "did the build change"
// signal in every environment: dev (aggressive - any bundle swap) and prod
// (only a real release re-hashes the entry).
//
// It ONLY ever calls location.reload() - no adb, no USB, no tunnel is touched.
// On a USB-tunneled Q-series panel the reload re-fetches assets over the
// EXISTING adb reverse tunnel; the service watcher's adb reboot/reseat paths are
// all immune to it (reseat keys on an adb transport-id change, which a WebView
// reload does not cause; the escalation reboot keys on 180s of tunnel silence,
// and the reload's own asset GETs keep stamping the tunnel's inbound-activity
// liveness the whole time). The one harmful outcome would be a reload LOOP
// re-bursting assets over that marginal link every cycle, so the per-target
// loop cap below bounds reloads to at most one per target hash.

// The single vite entry chunk. `index.html` names it once as its module script,
// and the running document carries the same tag - so both sides parse identically.
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

// sessionStorage (tab-scoped, survives a reload): records the entry we last
// reloaded TOWARD so a reload that didn't change the served entry (stale cache,
// a deploy still mid-copy) can't re-fire in a tight loop.
const TARGET_KEY = 'nexus_build_reload_target';
const AT_KEY = 'nexus_build_reload_at';
// A given target is reloaded to at most once per this window - the USB-burst
// loop cap. A new deploy (different hash) is never blocked by it.
export const RELOAD_LOCK_MS = 60_000;
// Poll cadence: a single no-store index.html GET (a few KB), negligible next to
// the 1Hz monitoring frames already crossing the tunnel.
const POLL_MS = 60_000;

export function extractEntry(html: string): string | null {
  return html.match(ENTRY_RE)?.[0] ?? null;
}

// Every hashed asset index.html references: the entry script, its
// static-import modulepreloads, and the stylesheet. All must be present before
// reloading - a deploy caught mid-copy can serve a new index.html + entry while
// a statically-imported chunk is not yet written; the reload then 404s that
// import and aborts the entry module, so main.tsx (and this watcher) never runs
// and the panel is stranded until the next deploy.
const ASSET_RE = /\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g;
export function extractAssets(html: string): string[] {
  return [...new Set(html.match(ASSET_RE) ?? [])];
}

// The entry this running document actually loaded, read once from the DOM.
// Null on the dev server (unhashed module graph) - the watcher then no-ops.
export function loadedEntry(): string | null {
  const src = document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? '';
  return extractEntry(src);
}

// A one-shot pairing/consume token in the URL means a reload would re-mount
// against an already-spent token (bogus "expired" error) and churn the relay -
// the same hazard the service worker's reload guards against. Skip while present.
export function hasOneShotToken(search: string): boolean {
  return /[?&](pair|token)=/.test(search);
}

export interface CheckDeps {
  loaded: string | null;
  oneShotToken: boolean;
  now: number;
  fetchText: (url: string) => Promise<{ ok: boolean; text: string }>;
  // Confirms EVERY asset the newly-served index.html references is fetchable
  // BEFORE reloading, so a deploy caught mid-copy never reloads into a 404'd
  // static import (which aborts the entry module and strands the panel).
  assetsOk: (urls: string[]) => Promise<boolean>;
  readTarget: () => { target: string | null; at: number };
  writeTarget: (entry: string, at: number) => void;
  reload: () => void;
  log: (msg: string) => void;
}

export type CheckResult = 'noop' | 'same' | 'locked' | 'unverified' | 'reload';

// One evaluation pass. The comparison + guard logic is deterministic; the I/O
// (fetch, storage, reload, clock) is injected so it is fully unit-testable.
export async function checkOnce(deps: CheckDeps): Promise<CheckResult> {
  if (!deps.loaded || deps.oneShotToken) return 'noop';

  let res: { ok: boolean; text: string };
  try { res = await deps.fetchText('/index.html'); } catch { return 'noop'; }
  if (!res.ok) return 'noop';

  const served = extractEntry(res.text);
  if (!served || served === deps.loaded) return 'same';

  const { target, at } = deps.readTarget();
  if (target === served && deps.now - at < RELOAD_LOCK_MS) return 'locked';

  if (!(await deps.assetsOk(extractAssets(res.text)))) return 'unverified';

  deps.writeTarget(served, deps.now);
  deps.log(`[nexus-web] new build ${served} (loaded ${deps.loaded}); reloading`);
  deps.reload();
  return 'reload';
}

function liveDeps(loaded: string): CheckDeps {
  return {
    loaded,
    oneShotToken: hasOneShotToken(window.location.search),
    now: Date.now(),
    fetchText: async (url) => {
      const r = await fetch(url, { cache: 'no-store' });
      return { ok: r.ok, text: r.ok ? await r.text() : '' };
    },
    assetsOk: async (urls) => {
      // HEAD (no body) each referenced asset; the browser's 6-connection cap
      // paces them. Only runs once per detected new build, just before reload.
      const oks = await Promise.all(
        urls.map((u) => fetch(u, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok, () => false)),
      );
      return oks.length > 0 && oks.every(Boolean);
    },
    readTarget: () => {
      try {
        return { target: sessionStorage.getItem(TARGET_KEY), at: Number(sessionStorage.getItem(AT_KEY) ?? 0) };
      } catch { return { target: null, at: 0 }; }
    },
    writeTarget: (entry, at) => {
      try {
        sessionStorage.setItem(TARGET_KEY, entry);
        sessionStorage.setItem(AT_KEY, String(at));
      } catch { /* storage blocked - loses the per-target cap, but a completed reload makes served == loaded (index.html is no-store), so the next pass returns 'same' and stops */ }
    },
    reload: () => window.location.reload(),
    log: (m) => console.info(m),
  };
}

// Wires the poll + wake triggers. Call once at boot (main.tsx). No-op when the
// running document has no hashed entry (dev server) - nothing to compare against.
export function initBuildReloadWatcher(): void {
  const loaded = loadedEntry();
  if (!loaded) return;

  const run = () => { void checkOnce(liveDeps(loaded)); };

  // The poll is the correctness backstop (catches a restart-less wwwroot swap).
  // The wake events make a foregrounded/reconnected client responsive without
  // waiting a full interval; the kiosk stays visible so the poll carries it.
  setInterval(run, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
}
