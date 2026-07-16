# Nexus SDK Capabilities Reference

Authoritative reference for what the SDK lets a Nexus app do. Read from source:
`sdk/runtime/sdk.ts`, `sdk/runtime/ui.tsx`, `sdk/runtime/hooks.tsx`,
`src/sandbox/contract/elements.ts`, `src/widgets/types.ts`.

For what the SDK cannot do, see [SDK-GAPS.md](../SDK-GAPS.md).

---

## The App Model

A Nexus app is a sandboxed React widget that the panel host renders. App code
runs in a Web Worker (React 18); the host renders the result as native,
panel-themed components. The author never touches the DOM or the host React
tree directly.

### Manifest schema

Every app ships a `manifest.json` validated against the `nexus.app/1` schema.
The TS shape lives in `src/widgets/types.ts`.

```jsonc
{
  "schema": "nexus.app/1",
  "id": "com.example.myapp",
  "name": "My App",
  "version": "1.0.0",
  "description": "Optional one-sentence description.",
  "author": { "name": "...", "url": "...", "email": "..." },
  "runtime": "sdk",

  // Which panel-grid surfaces the app provides.
  // "cell" = panel tile; "page" = expanded full view.
  "surfaces": ["cell", "page"],

  // Layout constraints for the cell surface.
  "sizes": ["1x1", "2x2", "4x2", "4x4"],
  "default_size": "2x2",

  // OEM bake-in: treat this app as active on a fresh profile (sidebar auto-pins
  // its page, no user "add" step needed).
  "preinstalled": false,

  // "device" places the app under DEVICES in the sidebar and renders its page
  // inside device-page chrome (the same chrome as Cooling, Lighting, etc.).
  "category": "device",

  "capabilities": {
    // Sensor families the app may read via useSensor / sensors.read.
    // Supported patterns: "cpu.*", "gpu.*", "memory.*",
    // "motherboard.*", "storage.*". Glob-matched.
    "sensors.read": ["cpu.*"],

    // rgb.read / rgb.write: reserved; no verb consumes them yet.
    "rgb.read": false,
    "rgb.write": false,

    // External HTTPS hosts the app may reach via useFetch / request.
    // The host SSRF-guards the proxy - loopback is always blocked.
    "net.fetch": ["api.open-meteo.com"],

    // Host-action allowlist. Every action the app calls via useDispatch
    // or reads via useHostAction must appear here.
    // Read actions: "screentime.today", "displays.list"
    // Write actions: "displays.setBrightness", "lighting.setColor",
    //   "cooling.setCurve", "cooling.applyPreset", "cooling.setDuty",
    //   "lighting.setMode"
    "dispatch": ["screentime.today", "displays.list", "displays.setBrightness"],

    // Service routes the app may POST files to via <MediaImport>.
    // The host enforces this list before opening the file picker or
    // touching the network.
    "mediaImport": ["/tryx/media"],

    // Whether the app exposes a settings schema.
    "config": true,

    // "worker" opts into Tier-2 (the bundled worker.mjs). Always "worker" for SDK apps.
    "code": "worker"
  },

  // Settings schema. Each entry maps to a control in the per-instance
  // settings pane the host renders.
  "settings": [
    { "key": "theme", "type": "select", "label": "Theme",
      "options": ["light", "dark"], "default": "dark" },
    { "key": "refreshMs", "type": "number", "label": "Refresh (ms)",
      "min": 5000, "max": 60000, "step": 1000, "default": 10000 }
  ],

  // First-party native sidecar (service-registered device driver).
  // Third-party apps do not use this field.
  "driver": null
}
```

#### `capabilities.dispatch`

The `dispatch` field (a `string[]`) is an allowlist of host-action names. The
host refuses any `useDispatch` call or `useHostAction` read that names an
action not present in this list. Actions the service currently registers:

| Action | Direction | Args | Result shape |
|---|---|---|---|
| `screentime.today` | read | none | `{ apps: [...], total: number }` |
| `displays.list` | read | none | `{ displays: [...] }` |
| `displays.setBrightness` | write | `{ id, brightness: 0..100 }` | `{ ok }` |
| `lighting.setColor` | write | `{ hex: string }` | `{ ok }` |
| `cooling.setCurve` | write | `{ channelId, sourceId, points: [{temp,speed}] }` | `{ ok }` |
| `cooling.applyPreset` | write | `{ presetId }` | `{ ok }` |
| `cooling.setDuty` | write | `{ channelId, duty: 0..100 }` | `{ ok }` |
| `lighting.setMode` | write | `{ mode, ... }` | `{ ok }` |

All dispatch calls return `{ ok: boolean, result?: unknown }`. Rate limit: 20
calls/second per app. See [SDK-GAPS.md](../SDK-GAPS.md) section B for what is
not yet registered.

#### `capabilities.mediaImport`

A `string[]` of service-relative paths (e.g. `"/tryx/media"`) the app may
upload files to via `<MediaImport uploadPath="...">`. The host validates the
`uploadPath` prop against this list before opening the native file picker. The
upload uses `postServiceForm` (LAN/desktop only - it fails closed over the
relay tunnel). Omit this field if the app does not import media.

---

## Surfaces

An app can render two surfaces, driven by separate worker instances of the same
bundle:

- **`cell`** - the panel tile. Sized by the grid. Every SDK app has a cell
  surface.
- **`page`** - an expanded full view opened by clicking the tile on desktop.
  Optional. Renders as a section route with native page chrome (title bar, full
  height scroll).

### `mount()`

The entry point every SDK app calls with its root component(s):

```tsx
import { mount } from '@hellonexus/sdk';

// Single component for both surfaces:
mount(MyApp);

// Or separate components per surface:
mount({ cell: MyCell, page: MyPage });
```

`mount(App)` routes `App` to whichever surface the host requests. When `page`
is omitted from the `WidgetSurfaces` object, a page open falls back to the
`cell` component.

### `useSurface()`

Inside a component, returns which surface the current render drives:

```tsx
const surface = useSurface(); // 'cell' | 'page'
```

---

## Hooks

All hooks must run inside a component rendered by a `mount()` call.

### `useSettings<T>()`

Returns the per-instance settings object (from the manifest `settings` schema,
edited by the user). Live - re-renders when the host pushes a change.

```tsx
const { theme, refreshMs } = useSettings<{ theme: string; refreshMs: number }>();
```

### `useSize()`

Returns the current rendered pixel size of the widget tile. Updates on resize.

```tsx
const { width, height } = useSize();
```

### `useSurface()`

Returns `'cell'` or `'page'`. Static for the life of a render. See Surfaces
above.

### `usePreview()`

Returns `true` when the host is rendering a catalog preview. Host I/O is
stubbed in preview mode. Use it to render co-located sample data instead of
waiting for live data:

```tsx
const preview = usePreview();
if (preview) return <Text value="42 °C" />;
```

### `useLocalState<T>(defaults)`

Per-instance state bag, persisted by the host across reloads (localStorage,
scoped by widget + instance id). The setter merges shallowly:

```tsx
const [s, set] = useLocalState({ running: false, startedAt: 0 });
set({ running: true, startedAt: Date.now() }); // merges
```

### `useTick(intervalMs)`

Re-renders on a timer. Pass `null` to stop. Returns current epoch ms:

```tsx
const now = useTick(s.running ? 100 : null);
```

Minimum interval is 16 ms.

### `useSensor(id)`

Subscribes to a single sensor reading (live, re-renders on change). Requires
the sensor's family pattern in `capabilities.sensors.read`:

```tsx
const cpuTemp = useSensor('cpu.package.temperature') as number | undefined;
```

Sensor id format: `family.path`. Supported families: `cpu`, `gpu`, `memory`,
`motherboard`, `storage`. Fan RPM, network, and per-process sensors are not
in the flattened set (see SDK-GAPS.md section A).

### `useFetch<T>(url, opts?)`

Brokered HTTPS fetch through the host proxy. The host in the URL must be in
`capabilities.net.fetch`. Returns `{ data, error, loading }`. `refreshMs`
re-fires on an interval (minimum 30 seconds):

```tsx
const { data, loading } = useFetch<WeatherData>(
  'https://api.open-meteo.com/v1/forecast?...',
  { refreshMs: 60_000 },
);
```

### `request(url, init?)`

Imperative brokered fetch for multi-step flows. Returns a `Promise<Response>`:

```tsx
const res = await request('https://api.open-meteo.com/v1/...');
const data = await res.json();
```

### `useDispatch()`

Returns a stable dispatch function. Use it for control writes or host-action
reads that need to fire in response to user interaction. The action must be in
`capabilities.dispatch`:

```tsx
const dispatch = useDispatch();
await dispatch('displays.setBrightness', { id: '1', brightness: 75 });
```

The return value is `{ ok: boolean, result?: unknown }`.

### `useHostAction<T>(action, opts?)`

Polls a host-action on a schedule and surfaces its `result`. Suitable for
data the host exposes only as a dispatch action (not a sensor or public
endpoint). Default poll interval: 5 seconds (minimum 2 seconds):

```tsx
const { data, loading } = useHostAction<ScreentimeData>('screentime.today', {
  refreshMs: 30_000,
});
```

### `useLatest<T>(value)`

Returns a stable ref that always holds the latest value. Useful for event
handlers that close over changing props:

```tsx
const latestSettings = useLatest(settings);
// inside an event handler: latestSettings.current
```

---

## UI Components (`@hellonexus/sdk/ui`)

All components are thin wrappers over `@remote-dom` elements. The host
renders the matching native component for each element name. An element the
host does not recognize renders nothing - that is the visual-consistency
boundary. Props are semantic (`tone`/`size`/`weight`/`variant`); there is no
`style` or `className` escape.

### Tone tokens

The `tone` prop (type `UiTone`) accepts:

```
'text' | 'text-dim' | 'text-faded' | 'accent' | 'accent-deep' | 'accent-glow'
| 'good' | 'warn' | 'bad' | 'border' | 'bg-card' | 'currentColor'
```

### Layout

#### `Stack`
Flexbox row or column.

| Prop | Type | Default |
|---|---|---|
| `direction` | `'row' \| 'column'` | `'row'` |
| `gap` | `number` | - |
| `padding` | `number` | - |
| `align` | `'start' \| 'center' \| 'end' \| 'baseline' \| 'stretch'` | - |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around'` | - |
| `wrap` | `boolean` | - |
| `grow` | `boolean` | - |
| `flex` | `number` | - |
| `children` | `ReactNode` | - |

#### `Grid`
CSS grid container.

| Prop | Type |
|---|---|
| `columns` | `number` |
| `rows` | `number` |
| `gap` | `number` |
| `padding` | `number` |
| `align` | `Align` |
| `justify` | `Justify` |
| `grow` | `boolean` |
| `children` | `ReactNode` |

#### `Frame`
A styled box - background, border, radius, direction.

| Prop | Type |
|---|---|
| `padding` | `number` |
| `gap` | `number` |
| `direction` | `'row' \| 'column'` |
| `align` | `Align` |
| `justify` | `Justify` |
| `tone` | `UiTone` |
| `radius` | `number` |
| `border` | `boolean` |
| `grow` | `boolean` |
| `children` | `ReactNode` |

#### `Spacer`
Flexible gap. `size` is in px (default: flex-fills remaining space).

#### `Divider`
Horizontal rule. `tone` tints the rule color.

#### `Scroll`
Scrollable container.

| Prop | Type | Default |
|---|---|---|
| `direction` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` |
| `gap` | `number` | - |
| `padding` | `number` | - |
| `grow` | `boolean` | - |
| `children` | `ReactNode` | - |

### Content

#### `Text`
Single-run text. Children or `value`.

| Prop | Type |
|---|---|
| `value` | `string \| number` |
| `tone` | `UiTone` |
| `size` | `number \| string` |
| `weight` | `'light' \| 'regular' \| 'medium' \| 'semibold' \| 'bold' \| 'black'` |
| `align` | `Align` |
| `transform` | `'none' \| 'uppercase' \| 'lowercase' \| 'capitalize'` |
| `mono` | `boolean` |
| `opacity` | `number` |
| `letterSpacing` | `number` |
| `lineHeight` | `number` |
| `tabular` | `boolean` |
| `truncate` | `boolean` |

Note: `Text` is a single run. Mixed bold/color inline text is not supported.

#### `Icon`
A Lucide glyph by name (lowercase, e.g. `"play"`, `"cpu"`, `"thermometer"`).

| Prop | Type |
|---|---|
| `name` | `string` |
| `size` | `number` |
| `tone` | `UiTone` |

#### `Image`
An image from an `https://`, `data:`, or `blob:` URL. The host validates the
scheme.

| Prop | Type |
|---|---|
| `src` | `string` |
| `alt` | `string` |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'none'` |
| `radius` | `number` |
| `width` | `number` |
| `height` | `number` |
| `aspect` | `string \| number` |
| `tone` | `UiTone` |

#### `Badge`
A small status pill. Host renders `src/components/common/Badge/Badge.tsx`.

| Prop | Type |
|---|---|
| `label` | `string` |
| `tone` | `UiTone` |
| `icon` | `string` |

#### `Empty`
Standard empty state (icon + title + hint). Host renders `src/components/common/EmptyState/EmptyState.tsx`.

| Prop | Type |
|---|---|
| `title` | `string` |
| `hint` | `string` |
| `icon` | `string` |
| `compact` | `boolean` |

#### `Section`
Uppercase section header for grouping a page. Host renders `src/components/common/SettingsSection/SettingsSection.tsx`.

| Prop | Type |
|---|---|
| `title` | `string` |

### Data visualization

#### `Ring`
Circular arc progress indicator. Host renders `src/components/common/Ring/Ring.tsx`.

| Prop | Type |
|---|---|
| `value` | `number` |
| `min` | `number` |
| `max` | `number` |
| `label` | `string` |
| `sublabel` | `string` |
| `tone` | `UiTone` |
| `thickness` | `number` |
| `children` | `ReactNode` |

#### `Bar`
Horizontal progress bar. Host renders `src/components/common/UsageBar/UsageBar.tsx`.

| Prop | Type |
|---|---|
| `value` | `number` |
| `min` | `number` |
| `max` | `number` |
| `tone` | `UiTone` |
| `label` | `string` |

#### `Range`
A lo..hi segment positioned on a min..max track (e.g. a day's temperature
range). Host renders `src/components/common/RangeBar/RangeBar.tsx`.

| Prop | Type |
|---|---|
| `lo` | `number` |
| `hi` | `number` |
| `min` | `number` |
| `max` | `number` |
| `gradient` | `'temp' \| 'accent'` |
| `glow` | `boolean` |
| `height` | `number` |
| `radius` | `number` |

#### `Gauge`
A 270-degree arc meter. Host renders `src/components/common/Gauge/Gauge.tsx`.

| Prop | Type |
|---|---|
| `value` | `number` |
| `min` | `number` |
| `max` | `number` |
| `tone` | `UiTone` |
| `label` | `string` |
| `sublabel` | `string` |

#### `Sparkline`
Single-series polyline chart. Host renders `src/components/common/Sparkline/Sparkline.tsx`.

| Prop | Type |
|---|---|
| `values` | `number[]` |
| `min` | `number` |
| `max` | `number` |
| `tone` | `UiTone` |

#### `Chart`
Multi-series line/area chart. Host renders `src/components/common/SeriesChart/SeriesChart.tsx`.

| Prop | Type |
|---|---|
| `series` | `Array<{ values: number[]; tone?: UiTone; area?: boolean }>` |
| `min` | `number` |
| `max` | `number` |
| `height` | `number` |
| `gridlines` | `boolean` |
| `tone` | `UiTone` |

### Interactive

#### `Slider`
A range input. Host renders `src/components/common/Slider/Slider.tsx`.

| Prop | Type | Notes |
|---|---|---|
| `value` | `number` | required |
| `min` | `number` | |
| `max` | `number` | |
| `step` | `number` | |
| `tone` | `UiTone` | |
| `label` | `string` | |
| `disabled` | `boolean` | |
| `trackFill` | `boolean \| number` | `true` auto-fills from start to thumb; a number (0..100) sets the fill end explicitly; omit for no fill |
| `orientation` | `'inline' \| 'stacked' \| 'bare'` | `'inline'` = label+track+value on one row; `'stacked'` = label above, full-width track; `'bare'` = track only |
| `onInput` | `(value: number) => void` | fires continuously during drag |
| `onChange` | `(value: number) => void` | fires on commit (drag release) |

#### `Button`
Host renders `src/components/common/Button/Button.tsx`.

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | |
| `tone` | `UiTone` | |
| `variant` | `'solid' \| 'soft' \| 'ghost'` | |
| `disabled` | `boolean` | |
| `icon` | `string` | icon name (lucide) |
| `size` | `'sm' \| 'md' \| 'lg'` | |
| `onPress` | `() => void` | tap/click |
| `onLongPress` | `() => void` | held press (450 ms threshold); suppresses the trailing `onPress` |
| `children` | `ReactNode` | |

#### `Toggle`
A boolean switch. Host renders `src/components/common/Toggle/Toggle.tsx`.

| Prop | Type |
|---|---|
| `value` | `boolean` |
| `disabled` | `boolean` |
| `label` | `string` |
| `onChange` | `(value: boolean) => void` |

#### `Segmented`
A row of icon+label pills. Host renders `src/components/common/IconLabelButton/IconLabelButton.tsx` per option. One option is active at a time.

| Prop | Type |
|---|---|
| `options` | `Array<{ key: string; label?: string; icon?: string }>` |
| `value` | `string` (active key) |
| `disabled` | `boolean` |
| `onChange` | `(key: string) => void` |

#### `Stepper`
A numeric up/down control. Host renders `src/components/common/Stepper/Stepper.tsx`.

| Prop | Type |
|---|---|
| `value` | `number` |
| `min` | `number` |
| `max` | `number` |
| `step` | `number` |
| `label` | `string` |
| `disabled` | `boolean` |
| `onChange` | `(value: number) => void` |

#### `Input`
A text/number input. `value` is for programmatic sets (reset/computed result),
not a controlled binding - typing is local. The host fires events with the
string value. Host renders `src/components/common/TextInput/TextInput.tsx`.

| Prop | Type |
|---|---|
| `value` | `string` (programmatic set only) |
| `placeholder` | `string` |
| `type` | `'text' \| 'number' \| 'search' \| 'password'` |
| `disabled` | `boolean` |
| `maxLength` | `number` |
| `tone` | `UiTone` |
| `align` | `Align` |
| `size` | `'sm' \| 'md'` |
| `mono` | `boolean` |
| `onValueChange` | `(value: string) => void` (fires on each keystroke) |
| `onEnter` | `(value: string) => void` |
| `onLeave` | `(value: string) => void` |

#### `Color`
The native HSV colour picker (SV square + hue strip + hex field). Host renders `src/components/common/HsvPicker/HsvPicker.tsx`.

| Prop | Type | Notes |
|---|---|---|
| `value` | `string` | hex, e.g. `"#ff8800"` |
| `onPreview` | `(hex: string) => void` | fires continuously during drag |
| `onChange` | `(hex: string) => void` | fires on commit |

#### `Curve`
A draggable X/Y curve editor. Host renders `src/sandbox/ui/CurveHost.tsx` (the native cooling fan-curve control). Drag a point to move it, double-click empty space to add, right-click a point to remove.

| Prop | Type |
|---|---|
| `points` | `Array<{ x: number; y: number }>` |
| `xmin`, `xmax`, `ymin`, `ymax` | `number` |
| `tone` | `UiTone` |
| `onPreview` | `(points: CurvePoint[]) => void` (fires during drag) |
| `onChange` | `(points: CurvePoint[]) => void` (fires on commit) |

#### `Card`
A standard card surface with optional title/subtitle chrome. Host renders `src/components/common/Card/Card.tsx`.

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | |
| `subtitle` | `string` | |
| `interactive` | `boolean` | makes the whole card pressable |
| `onPress` | `() => void` | fires on tap/click when `interactive` |
| `onLongPress` | `() => void` | fires on held press when `interactive` (450 ms threshold) |
| `children` | `ReactNode` | |

#### `Spinner`
An indeterminate loading arc. Host renders `src/components/common/Spinner/Spinner.tsx`.

| Prop | Type |
|---|---|
| `size` | `number` |
| `tone` | `UiTone` |

### Blessed composites

These are host-owned: the worker places them and supplies serializable inputs;
the host renders the same pure native component a built-in widget uses. An SDK
page using these is pixel-identical to the native equivalent with no
reimplementation.

#### `ViewHeader`
The standard page header. Renders the title in the top bar and a tab strip
below it. Gives SDK pages the same chrome native pages use.

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | required |
| `tabs` | `Array<{ key: string; label: string; disabled?: boolean }>` | optional tab strip |
| `activeTab` | `string` | currently active tab key |
| `onChange` | `(key: string) => void` | fires when the user switches tabs |

```tsx
const [tab, setTab] = useState('upload');
<ViewHeader
  title="Tryx"
  tabs={[
    { key: 'upload', label: 'Upload' },
    { key: 'library', label: 'Library' },
  ]}
  activeTab={tab}
  onChange={setTab}
/>
```

#### `ClockFace`
One of the 8 native clock designs. The worker supplies the epoch ms tick; the
host draws the face.

| Prop | Type |
|---|---|
| `nowMs` | `number` (epoch ms) |
| `design` | `string` (design key, e.g. `'digital'`, `'analog'`) |
| `tz` | `string` (IANA tz, e.g. `'America/New_York'`) |
| `showSeconds` | `boolean` |
| `showDate` | `boolean` |
| `showTimezone` | `boolean` (short zone name on the date line) |
| `hour12` | `boolean` |
| `useAccentColor` | `boolean` |
| `size` | `string` (e.g. `'4x2'`) |

#### `WorldClock`
The full day/night world map + scrollable city cards. Self-ticking.

| Prop | Type |
|---|---|
| `highlightTz` | `string` (IANA tz to highlight on the map) |

### `MediaImport`

Host-mediated file pick + crop + upload. The app must list the `uploadPath` in
`capabilities.mediaImport`; the host refuses to open the file picker or touch
the network for unlisted paths. Works LAN/desktop only - fails closed over the
relay tunnel.

| Prop | Type | Notes |
|---|---|---|
| `uploadPath` | `string` | service route, e.g. `"/tryx/media"`. Must be in `capabilities.mediaImport` |
| `accept` | `string` | MIME filter for the file picker (default `"video/*"`) |
| `aspectRatio` | `number \| string` | target aspect ratio as a number (width/height) or `"W:H"` string. When set, the host shows the crop dialog before upload |
| `minWidth` | `number` | |
| `minHeight` | `number` | |
| `maxWidth` | `number` | |
| `maxHeight` | `number` | |
| `targetWidth` | `number` | width to pass to the service as a resize hint |
| `targetHeight` | `number` | height to pass to the service as a resize hint |
| `label` | `string` | button label (falls back to the locale's "Choose video" string) |
| `onProgress` | `(fraction: number) => void` | fires with 0..1 during the import flow |
| `onComplete` | `(result: unknown) => void` | fires with the parsed service JSON response |
| `onError` | `(message: string) => void` | fires with an error message string |

When `uploadPath` is not in the allowlist the button renders inert with a
visible error hint. The host posts the file as `multipart/form-data` with a
`file` part and a normalized `crop` string (`"x,y,w,h"` in 0..1 of the source).
If `targetWidth`/`targetHeight` are set they are appended as form fields.

### `MediaGrid`

The media library grid - the same `MediaGrid` the Q-series/Y70 panel-background
picker renders: a responsive grid of thumbnail tiles with a selected state and a
hover-revealed delete X. Pair it with `<MediaImport>` for upload and
`<ConfirmDialog>` for delete confirmation (the picker pattern).

| Prop | Type | Notes |
|---|---|---|
| `items` | `{ id, name, durationSec? }[]` | one tile per item; `durationSec > 0` shows the clip length, else the tile reads as a static image |
| `thumbs` | `Record<string, string>` | item id -> thumbnail URL (`https:`/`data:`/`blob:`) |
| `activeId` | `string` | the selected item's id (accent border) |
| `thumbAspect` | `number` | thumbnail aspect (width/height) |
| `deleteAriaLabel` | `string` | aria-label for the delete X |
| `onPlay` | `(id: string) => void` | fires when a tile is tapped |
| `onDelete` | `(id: string) => void` | fires the delete X (omit to hide it) |

### `ConfirmDialog`

The native themed confirm modal. Controlled: hold `open` in state, flip it from
`onConfirm`/`onCancel`. Esc cancels, Enter confirms, click-outside cancels.

| Prop | Type | Notes |
|---|---|---|
| `open` | `boolean` | |
| `title` | `string` | |
| `message` | `string` | newlines render as paragraph breaks |
| `note` | `string` | optional dimmed hint below the message |
| `confirmLabel` / `cancelLabel` | `string` | defaults "OK" / "Cancel" |
| `destructive` | `boolean` | red confirm button (default true) |
| `onConfirm` / `onCancel` | `() => void` | |

### `Collapsible`

The canonical collapsible section header (chevron + title, holds children).
Controlled: hold `open` in state, flip it from `onToggle`.

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | |
| `open` | `boolean` | |
| `right` | `string` | optional non-interactive text on the right of the header |
| `compact` | `boolean` | smaller uppercase header |
| `onToggle` | `() => void` | |
| `children` | `ReactNode` | shown when open |

### `Tooltip`

A hover/focus tooltip wrapping a single child trigger.

| Prop | Type | Notes |
|---|---|---|
| `body` | `string` | tooltip text |
| `title` | `string` | optional bold first line |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | placement (default bottom) |
| `children` | `ReactNode` | the trigger element |

---

## Utility functions

Exported from `@hellonexus/sdk`:

| Function | Signature | Notes |
|---|---|---|
| `clamp` | `(value, lo, hi) => number` | |
| `pct` | `(value, lo, hi) => number` | normalized 0..1 |
| `formatDuration` | `(ms, mode?) => string` | modes: `'auto'`, `'hms'`, `'ms'`, `'hmsAuto'`, `'hundredths'`, `'msHundredths'` |

---

## Short example: "Hello, device app" (Tryx pattern)

This mirrors the pattern of `apps/com.hellonexus.tryx`: a `category:"device"`
app with a `ViewHeader` tab bar, a `useDispatch` call, and a `MediaImport`
component.

**`manifest.json`**

```json
{
  "schema": "nexus.app/1",
  "id": "com.example.mydevice",
  "name": "My Device",
  "version": "1.0.0",
  "runtime": "sdk",
  "surfaces": ["cell", "page"],
  "category": "device",
  "sizes": ["2x2"],
  "default_size": "2x2",
  "capabilities": {
    "sensors.read": [],
    "rgb.read": false, "rgb.write": false,
    "net.fetch": [],
    "dispatch": ["displays.list"],
    "mediaImport": ["/mydevice/media"],
    "config": false,
    "code": "worker"
  }
}
```

**`index.tsx`**

```tsx
import { useState } from 'react';
import { mount, useSurface, useHostAction, useDispatch } from '@hellonexus/sdk';
import { Stack, Text, ViewHeader, MediaImport, Spinner } from '@hellonexus/sdk/ui';

function CellView() {
  return (
    <Stack direction="column" gap={8} align="center" justify="center" grow>
      <Text value="My Device" size="1.1em" weight="semibold" />
    </Stack>
  );
}

function PageView() {
  const [tab, setTab] = useState('upload');
  const { data: displays, loading } = useHostAction('displays.list');
  const dispatch = useDispatch();

  return (
    <Stack direction="column" grow>
      <ViewHeader
        title="My Device"
        tabs={[
          { key: 'upload', label: 'Upload' },
          { key: 'status', label: 'Status' },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      {tab === 'upload' && (
        <Stack direction="column" padding={16} gap={12}>
          <Text value="Import a video clip:" tone="text-dim" />
          <MediaImport
            uploadPath="/mydevice/media"
            accept="video/*"
            aspectRatio="16:9"
            targetWidth={1920}
            targetHeight={1080}
            onProgress={f => console.log('progress', f)}
            onComplete={r => console.log('done', r)}
            onError={msg => console.error(msg)}
          />
        </Stack>
      )}
      {tab === 'status' && (
        <Stack direction="column" padding={16} gap={8}>
          {loading ? <Spinner /> : (
            <Text value={`${(displays as any)?.displays?.length ?? 0} display(s)`} />
          )}
        </Stack>
      )}
    </Stack>
  );
}

mount({ cell: CellView, page: PageView });
```

---

## Known limits

See [SDK-GAPS.md](../SDK-GAPS.md) for the full adversarial audit: sensor
coverage, missing control actions, styling limits, interaction limits, perf,
and authoring DX gaps.
