# Nexus widget SDK (sandboxed, remote-component model)

Authors write **real React** against a shared component library (`@hellonexus/ui`) and
data/control hooks (`@hellonexus/sdk`). The code runs in a **sandboxed Web Worker**; the
host renders the result as real, panel-themed components. Not declarative JSON - code -
while keeping the sandbox and visual consistency.

This is the first tranche / dogfood. Three marketplace widgets are converted and proven
end-to-end in a real browser: **stopwatch**, **clock**, **timer**.

## How it works

```
  Worker (sandbox, react@18)                         Host (panel, react@19)
  ┌─────────────────────────────┐                    ┌──────────────────────────────┐
  │ your widget (real React)     │                    │ RemoteReceiver (tree state)   │
  │   ↓ @hellonexus/ui           │   @remote-dom +    │   ↓ RemoteTree (owned)        │
  │ react-dom → remote elements  │ ── @quilted/threads│ element name → @hellonexus/ui │
  │   (polyfilled DOM)           │   over MessagePort │   host component (themed)      │
  └─────────────────────────────┘                    └──────────────────────────────┘
```

- The worker renders your React tree into a polyfilled DOM of `RemoteElement`s; `@remote-dom`
  serializes mutations over a dedicated `MessagePort` (separate from the `nexus.*` data RPC).
- The host receives them into a `RemoteReceiver` and an owned React-19 renderer maps each
  element name to a blessed `@hellonexus/ui` component. **The host renders only blessed
  elements - anything else renders nothing.** That is the structural visual-consistency
  boundary: a widget cannot draw raw DOM/CSS.
- The worker keeps the existing hardened sandbox boot (stripped globals, `nexus.*` RPC,
  watchdog). Authoring needs no knowledge of any of this.

## Writing a widget

```tsx
import { mount, useLocalState, useTick, formatDuration } from '@hellonexus/sdk';
import { Stack, Text, Button, Icon } from '@hellonexus/ui';

function Stopwatch() {
  const [s, set] = useLocalState({ running: false, startedAt: 0, pausedElapsed: 0 });
  const now = useTick(s.running ? 100 : null);
  const elapsed = s.running ? now - s.startedAt + s.pausedElapsed : s.pausedElapsed;
  return (
    <Stack direction="column" padding={12} gap={10} align="center" justify="center" grow>
      <Text value={formatDuration(elapsed, 'hmsAuto')} size="2.6em" weight="black" tabular />
      <Button label="Start" tone="accent" onPress={() => set({ running: true, startedAt: Date.now() })}>
        <Icon name="play" size={16} />
      </Button>
    </Stack>
  );
}
mount(Stopwatch);
```

The same widget as declarative JSON was ~120 lines plus a binding mini-language
(`now()`, `formatDuration`, `conditional`, `localUpdate`). Here it is plain React.

- **Components** (`@hellonexus/ui`): layout - `Stack`, `Grid`, `Frame`, `Spacer`, `Divider`,
  `Scroll`, `Layer`; content - `Text`, `Icon`, `Image`, `Sprite`, `Badge`, `Empty`, `Section`, `Card`; data viz -
  `Ring`, `Bar`, `Range`, `Gauge`, `Sparkline`, `Chart`; input - `Slider` (see `trackFill` /
  `orientation` below), `Button`, `Stepper`, `Input`, `Toggle`, `Segmented`, `Color` (native HSV
  picker), `Curve` (draggable curve editor), `Spinner`; blessed composites - `Avatar` (host-rendered 3D character with an immersive controls drawer: live-stream pop-up, sticker mode, zoom, exit), `ClockFace`,
  `WorldClock`, `ViewHeader` (real native tab bar), `MediaImport` (host-mediated file pick +
  crop + upload). Props are semantic (`tone`/`size`/`weight`/`variant`) and theme through panel
  tokens. No `style`/`className` - that is deliberate (consistency). `Button`/`Card` also take
  `onLongPress`.
- **Hooks** (`@hellonexus/sdk`): `useLocalState`, `useSettings`, `useSize`, `useTick`,
  `useSensor`, `useFetch`, `useDispatch`, `useHostAction`, `useSurface`, `usePreview`,
  `useLatest`, `request`. Plus `formatDuration`/`clamp`/`pct`.
- **`Slider` additions**: `trackFill` controls the accent fill (auto from value, or pass a
  `number` 0..100 to pin the fill end; bipolar ranges auto-fill centre-out). `orientation`
  selects `'inline'` (label+track+value on one row, default), `'stacked'` (label above,
  full-width track), or `'bare'` (track only, for custom label layouts).
- **`Layer` + `Sprite`**: the one escape from the closed layout set. `Layer` is a clipped,
  positioned stage whose `Sprite` children carry `x`/`y`/`z`/`scale`/`flip` and may overlap;
  `Layer`'s `onPress` reports a layer-local `{ x, y }`, the only coordinate an author can
  read. A `Sprite` draws one cell of an atlas shipped once as a `data:` URL, so animating is
  a `frame` index rather than an image per frame, and `pixelated` (default on) keeps pixel
  art crisp. Built for sprite-animated widgets - the aquarium app runs 92 frames of artwork
  in a 6 KB gzipped bundle this way.
- **`ViewHeader`**: a blessed composite that renders the real native page header (title in the
  top bar + a tab strip). Pass `tabs` (`[{ key, label, disabled? }]`), `activeTab`, and
  `onChange` to get a first-class tabbed page identical to a native one.
- **`MediaImport`**: a blessed composite for host-mediated file pick + crop + upload.
  Requires listing the target service path in `capabilities.mediaImport`. The host opens a
  native file picker, optionally runs the crop dialog, and POSTs multipart to the route. Works
  LAN/desktop only (fails closed over the relay tunnel). Props: `uploadPath`, `accept`,
  `aspectRatio`, `minWidth`/`minHeight`/`maxWidth`/`maxHeight`, `targetWidth`/`targetHeight`,
  `label`, `onProgress`, `onComplete`, `onError`.
- **`category:"device"`** manifest field: marks the app as a device app. It appears under
  DEVICES in the sidebar nav and its page renders inside device-page chrome (the same chrome
  as Cooling, Lighting, etc.) rather than the standard widget section route.
- **Full capabilities reference**: `sdk/docs/CAPABILITIES.md` - the manifest schema,
  surfaces, all hooks, all components with props, the dispatch action table, and a
  short device-app example.
- **Build**: `node build.mjs` bundles each `widgets/<id>/index.tsx` to a worker ESM module
  (`dist/<id>/widget.mjs`).

### Author CLI (`sdk/cli/nexus-app.mjs`)

The build an outside author runs once they `npm install @hello-nexus/sdk`. It externalises
`react` / `react/jsx-runtime` / `@hello-nexus/sdk` / `@hello-nexus/sdk/ui` to thin shims over
the host-provided `globalThis.__nexusRuntime`, so the shipped `widget.mjs` is only the author's
code (a starter app builds to ~1.3 KB).

```sh
node sdk/cli/nexus-app.mjs new my-app     # scaffold nexus.app/1: index.tsx + manifest.json + assets + config
node sdk/cli/nexus-app.mjs build my-app   # -> my-app/widget.mjs  (--dev, --sourcemap)
node sdk/cli/nexus-app.mjs dev my-app     # rebuild widget.mjs on change (unminified)
node sdk/cli/nexus-app.mjs validate my-app # check manifest + entry against the nexus.app/1 schema
```

The shim re-exports exactly what the runtime exports (probed). Runtime source: the installed
`@hello-nexus/sdk` if resolvable, else this repo's `sdk/runtime` (dev), overridable via
`NEXUS_SDK_RUNTIME`. In-repo today (not yet a published bin).

## Native widget vs sandboxed SDK widget - the exact difference

| | Native built-in widget | Sandboxed SDK widget |
|---|---|---|
| Language | React/TSX in the app bundle | React/TSX in a worker bundle |
| Runs on | Main thread, app's React 19 | Web Worker, bundled React 18 |
| Elements it can render | Anything (any HTML/SVG, any `components/common`) | Only `@hellonexus/ui` (host renders nothing else) |
| Styling | Any CSS / scss modules / inline | Semantic props → panel tokens only |
| Data access | Imports app stores/hooks directly (`useMonitoringFrame`, context) | `@hellonexus/sdk` hooks over brokered `nexus.*` RPC |
| Host writes (cooling/lighting/system) | Calls services directly | `useDispatch` → triple-gated `WidgetActionRegistry` |
| DOM / browser APIs | Full | None (no DOM, no `fetch`/`WebSocket`/storage) - brokered only |
| Event handlers | Synchronous | Async RPC (host → worker); sub-frame latency |
| Local state | Component state / localStorage | `useLocalState`, persisted by the host per instance |
| Crash blast radius | Can break the panel | Isolated; the worker dies alone, watchdog'd |
| Trust needed | First-party only | Any signed third party (cert grants gate capability) |

Porting a native widget to the SDK is mechanical: swap raw `<div>`+scss for `@hellonexus/ui`
primitives, and move store/DOM access to SDK hooks. The author mental model is unchanged.

## Performance (measured, Chromium, this machine)

- **Boot** (worker spawn + bundle fetch + render + first paint): **~140 ms** for one widget.
- **Bundle size** (self-contained, everything inlined): **~186 KB raw / ~60 KB gzip** per
  widget - react-dom + @remote-dom + threads dominate; the author code is a few KB.
- **Multi-widget** (12 tiles): main-thread heap grows gently (~4 MB → ~8 MB for 1 → 12);
  one worker per widget. The real cost is N worker React instances - see Packaging.

## Packaging

Today each widget bundle is self-contained (~60 KB gz). The big win is a **host-provided
shared runtime**: ship react/react-dom/@remote-dom/@quilted/threads + the SDK runtime once
(host-served, cached), and have author bundles externalize them.

| Build | raw | gzip |
|---|---|---|
| self-contained (current) | 186 KB | **60 KB** |
| framework externalized (shared runtime) | 5.4 KB | **2.2 KB** |

A ~27× reduction in per-widget download. The host already serves widget code per
code-session, so the runtime is one extra cached module. (Not yet wired - next step.)

## Convergence: one SDK, two execution modes (how built-ins eventually convert)

The per-worker React cost and the async-event latency are prices of *isolation*, which only
third-party code needs. Because `@hellonexus/ui` host components and author components share
one prop contract, the **same widget source can run two ways**:

1. **Sandboxed** (third-party): worker + @remote-dom (this tranche).
2. **Inline/trusted** (first-party built-ins): render the same component code directly on the
   main thread against the host `@hellonexus/ui` components - no worker, no serialization,
   zero overhead, identical to native.

This is the path to "convert all built-ins to the SDK without divergence": built-ins author
against the SDK and run inline; third-party widgets run the identical code sandboxed. Inline
mode is not built yet; it is the recommended next milestone after the shared runtime.

## Status

- Proven end-to-end (real browser, real worker): stopwatch, clock, timer. Host renderer unit
  tests + 4 sandbox e2e tests green.
- Not yet: data-driven widgets (weather/screentime need `nexus.*` sensor/fetch wiring into
  the SDK host), the host-provided shared runtime, inline/trusted mode, control components
  (`useControl`) end-to-end.
- Known refinement: the `Stepper` host component is wider than the native vertical-chevron
  stepper and can overflow a narrow timer cell.
