# What the SDK does NOT let you do (adversarial review)

Compiled from two adversarial reviews of the sandboxed SDK widget system, validated against
the code. Severity: **blocker** = whole widget class impossible / shipped surface that silently
does nothing; **major** = a capability class is unreachable; **minor** = a sharp edge.

## Fixed during this round (was broken, now works)
- **`useSensor` was dead** — the SDK host never serviced `nexus.sensors.*`, so it returned
  `undefined` forever. Now wired (host.ts feeds from `monitoringStore`), and the `sensors.read`
  pattern allowlist is now **enforced** (the declarative path still doesn't enforce it).
- **`nexus.welcome` wasn't sent** → `nexus.ready` never resolved. Now sent.
- **Dispatch data-path + control** (`useHostAction` / `useDispatch`) now work end-to-end
  (screentime.today, displays.list/setBrightness).

## Added this round (new capabilities)
- **Page surface** — `mount({ cell, page })`. A widget renders a second, expanded surface
  (a separate worker render, `useSurface()`) opened as a **desktop section route** by
  clicking the tile. Standard page chrome: title in the top bar, the standard `ViewHeader`
  with **tabs**, full-height scroll. (Touch-immersive page = follow-up.)
- **Blessed composites** — `ui-clockface` (the 8 clock designs), `ui-worldclock` (the full
  day/night world map + city list), `ui-viewheader` (title + tabs). The host renders the
  **same pure native component** (no reimplementation), so a first-party SDK widget is
  **pixel-identical to native with zero duplication**. This is the escape hatch for bespoke
  visuals (SVG world map, analog face) that the closed primitive set can't express — without
  a raw canvas/SVG hole that would break the consistency guarantee. Cost: each composite is a
  curated entry in the shared element contract (a deliberate coupling), and only **first-party**
  pure components can be blessed — arbitrary third-party custom visuals still can't.

## A. Data the SDK can't reach (major)
- Only **two** read host-actions exist: `screentime.today`, `displays.list`. Everything else is
  unreachable: media now-playing, cooling curves/channels, lighting state, OBS/Discord/Steam
  status, screen-mirror, fan RPM / network / per-process sensors, **any `/api/*` endpoint, any
  WS topic**. Reason: the proxy **blocks loopback** (`WidgetProxyService.IsPrivateOrReservedAddress`)
  by design, and there's **no topic/WebSocket broker** (`nexus.subscribe(topic)` doesn't exist).
- Sensors cover only **5 families** (cpu/gpu/memory/motherboard/storage) — no fan RPM, no network,
  no per-process (`flattenFrameForWorker`).
- *To open these:* register a read-only `WidgetAction` per surface (e.g. `media.nowPlaying`,
  `cooling.channels`, `lighting.state`), and/or add a multiplex-topic broker.

## B. Control the SDK can't do (major)
- Only **`displays.setBrightness`** is a registered write. Cannot drive: cooling presets / fan
  duty, lighting modes / effects, media transport, system volume, macros / deck, app launch,
  power. Each needs a registered `WidgetAction` (the plan's parametric cooling broker is unbuilt;
  `dispatch.ts` even references a non-existent `lighting.setMode`).
- **`rgb.read` / `rgb.write`** manifest grants are dead (no verb consumes them).

## C. Security / trust (vs the third-party-app-sdk plan)
- **Grants come from the manifest, not a signed cert** — the plan's central thesis. Any installed
  widget can self-grant `dispatch` actions + `net.fetch` hosts by editing its own `manifest.json`.
  Backstops today: few actions exist + the SSRF guard. (`net.fetch` allowlist IS enforced
  server-side; sensors.read is now enforced on the SDK path.)
- **No rate-limit / watchdog on the SDK dispatch path.** A worker can loop `displays.setBrightness`
  (real DDC/CI writes) with no server throttle; the SDK host has no no-publish watchdog (the
  declarative one does). *To fix:* per-widget rate bucket on `/widgets-api/dispatch` + a host watchdog.

## D. UI primitives that don't exist — whole widget classes blocked (blocker)
- **No image** (remote / data-url) → blocks media album art, steam avatars, gallery.
- **No scroll / virtualized list** → blocks steam friends, emoji grid, any long list (samples cap
  at ~8 rows).
- **No text input / textarea** → blocks calculator entry, search, notes, manual city entry.
- **No line / area / curve / multi-series chart** (only Ring/Bar/Range/Gauge/Sparkline; Sparkline
  is a bare single-series polyline) → blocks the cooling curve editor, monitoring history graphs.
- **No canvas / WebGL / SVG passthrough / custom paths** → blocks the lighting LED-map and the
  ~16 bespoke monitoring gauge designs. (By design — a sandboxed canvas breaks the consistency
  guarantee. Out of scope, or add curated parameterized gauges.)
- **No video, no map, no rich/inline-styled text** (`Text` is single-run — can't mix a bold +
  colored word in one line). *To fix inline text:* let `ui-text` accept nested `ui-text` runs.
- `Gauge` is a **Ring alias** (stub); `Stepper` overflows narrow cells.

## E. Styling / layout limits (major)
- **No raw color** (12 tone tokens only) → can't render a lighting **color swatch** (a raw RGB
  fill). No gradient beyond 2 presets, no shadow, no per-element border/radius (except `Frame`),
  no background-image, no absolute/overlap/z-index positioning.
- **No transitions / animations / keyframes / hover / focus / active** → blocks gallery crossfade,
  media EQ animation, button press feedback, spinners.
- **No spinner / tooltip / popover / modal** (loading states are static `Text "Loading…"`).

## F. Interaction (major)
- Events are 3: button `press`, slider `input`/`change`, stepper `change`. **No** drag/drop,
  swipe, long-press, hover, scroll, keyboard (beyond the slider keyUp), focus mgmt, context-menu,
  clipboard, multi-touch → blocks the cooling curve editor, deck reorder, emoji copy.
- **Every event is an async host→worker RPC** → high-frequency gestures (drag/scroll) are laggy,
  worst on the Q60 (Chromium 83). Continuous gestures must be host-handled; the displays slider
  already needs optimistic local state to hide the round-trip.

## G. Rendering correctness / perf (major/minor)
- Per-node `useSyncExternalStore` subscription → large lists are costly; no windowing → ~8-row
  practical cap.
- Keyed reconciliation is by remote-dom `node.id`, **not author key** → possible state bleed on
  reordered lists (untested; add a reorder test).
- **No per-widget error boundary** in the host renderer; worker errors reach only the host
  console, never the widget surface. No Suspense/async render.

## H. Lifecycle / state (major)
- **No teardown notification** — the worker is `terminate()`d mid-execution; no `nexus.shutdown`,
  no flush/cancel hook.
- Persistence is **per-instance `localStorage` only** (browser-local — phone vs desktop differ;
  no host-backed sync).
- **No cross-widget shared state / inter-widget channel** (BroadcastChannel/MessageChannel killed).
- **No background work when not rendered** (worker disposed ~2.5 s after unmount).
- Scheduling is an in-worker interval only (`timer.every` floored 30 s); no cron / wall-clock /
  persistent timers.
- **No system-event reactions** (sleep/resume/device-hotplug/profile-change).

## I. Authoring DX / footprint (major/minor)
- **No published `@hellonexus/ui` / `@hellonexus/sdk` npm packages** — authors import in-tree paths;
  a third party can't `npm install` the SDK.
- No hot reload / preview / Storybook; no worker debugging / on-panel error surface.
- **React 18-in-worker vs React 19-host** split (footgun; `SDK_PROTOCOL_VERSION` exists but isn't
  checked at the boundary).
- No settings-UI schema, no i18n hook, no asset/CSS/font bundling.
- **~190 KB per widget bundle** (react-dom + remote-dom bundled), **one react-dom per worker**,
  boot ~140 ms. The host-provided shared runtime (→ ~5.4 KB) and inline/trusted mode are both
  **unbuilt**.

## Bottom line
Of the native widgets cross-checked, only the "stat + button" shaped ones port cleanly
(stopwatch/clock/timer/screentime/weather/displays — and weather/screentime only because they
were trimmed to fit). **media, steam, cooling, gallery, calculator, emoji, lighting, monitoring**
are each blocked by ≥1 D/E/F blocker. The highest-leverage next steps: (1) a host-provided shared
runtime + inline mode (footprint + perf), (2) `ui-image` + `ui-scroll` + `ui-input` + a real
chart (unblocks ~half the native widgets), (3) more read/write host-actions (data/control breadth),
(4) the signed-cert grant model + dispatch rate-limit (trust).
