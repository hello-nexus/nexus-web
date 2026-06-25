# nexus-web

React + TypeScript + Vite dashboard for [Nexus](https://hellonexus.com). The same
bundle is shipped two ways:

- **Standalone web app** - served via the bundled Node server (`npm start`)
  or any static host. Used during development and for the marketing demo.
- **Service-embedded UI** - built into [`nexus-service`](https://github.com/hello-nexus/nexus-service)
  and served by the local service (Windows, macOS, Linux) on
  `http://127.0.0.1:9400` / `https://127.0.0.1:9443`. Builds with
  `npm run build:service`.

## Setup

Prerequisites: Node.js 22.12 or newer (Vite supports `^20.19.0 || >=22.12.0`).

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server expects a running `nexus-service` at `http://127.0.0.1:9400`
for live data; start one with `dotnet run` in the sibling `nexus-service`
repo. Debug builds of the service accept Vite dev-server origins via CORS,
so no extra configuration is needed.

Standalone production build:

```bash
npm run build      # outputs dist/
npm start          # serves dist/ at http://localhost:3000 (override with PORT)
```

Service-embedded build (normally triggered automatically by the
`nexus-service` build, which copies `dist/` into its `wwwroot/`):

```bash
npm run build:service
```

## Surfaces

The app routes a small set of top-level surfaces from the URL path:

| Path | Purpose |
|---|---|
| `/` | Dashboard (desktop). Connects to nexus-service over REST + WS. |
| `/panel/:deviceId` | Kiosk panel surface for embedded touchscreens. |
| `/panel/phone` | Mobile remote surface (paired via QR). |
| `/overlay` | Per-monitor overlay hosted by `nexus-overlay.exe`. |
| `/r/pair` | iOS Universal Link landing page (App Store / browser fallback). |

`/touch` and `/panel/q60` are legacy aliases that land in the panel
allocation flow.

## Project layout

Everything ships from `src/`. Top-level folders:

| Folder | Contents |
|---|---|
| `api/` | Typed REST/WS clients for `nexus-service` + the cloud API - one file per domain (`cooling`, `lighting`, `displays`, `keeb`, `gallery`, `panel`, `internetPairing`…). Host resolution lives in `api/service.ts`. |
| `app/` | Desktop **dashboard shell**: `Dashboard.tsx`, sidebar, pairing modals, panel entrypoint + routing, window caption buttons. |
| `components/` | Shared React components - `common/` (design-system primitives), `views/` (full dashboard sections), `builder/` (PC-builder UI), `peripherals/`, `icons/`. |
| `diag/` | Renderer diagnostics - the memory/health probe that reports JS-heap, DOM-node, and reconnect samples to the service log (`/diagnostics/client-mem`) on significant change. |
| `hooks/` | Reusable hooks, mostly data/state (`useDevices`, `useCooling`, `useMultiplexSocket`…). |
| `lib/` | Non-React utilities + stores (`appStore`, `monitoringStore`, `i18n`, `settings`, `webhid/`, codecs, sensor resolvers). |
| `locales/` | The i18n JSON bundles (en + 13 others). |
| `overlay/` | The `/overlay` surface - per-monitor overlay shell + bridge to `nexus-overlay.exe`. |
| `panel/` | The kiosk/phone **panel** surface and its own rendering engine (`engine/`, `editor/`, `chrome/`, `theme/`, `dnd/`, `background/`, `overlays/`, `embed/` simulator). `panel/widgets/` holds the built-in widget implementations. |
| `sandbox/` | Host runtime for **sandboxed SDK widgets** ("Nexus apps"): boots a hardened Web Worker per widget, installs the `nexus.*` API, and renders the worker's remote-dom tree. This is what executes third-party app bundles. |
| `search/` | Global command palette / top search (providers, fuzzy match, frecency). |
| `storybook/` | In-app component gallery - **not** the npm Storybook tool; a dev surface that previews design-system components. |
| `styles/` | Global SCSS (variables, text, scrollbar, interactions, reset). |
| `telemetry/` | Analytics events + a reference view listing them. |
| `types/` | Shared TS types + ambient declarations (`scss.d.ts`, `global.d.ts`). |
| `widgets/` | Client glue for the **marketplace/SDK app layer** - wire types, installed-apps API, marketplace registry, settings bridge. Feeds installed apps into the panel picker. |
| `__tests__/` | Cross-cutting test suites + vitest setup. |

Three "widget/app" layers are easy to confuse: `panel/widgets/` is the built-in
widgets; `widgets/` is the marketplace feed that injects installed SDK apps into
the panel picker; `sandbox/` is the runtime that hosts those SDK apps. The app
bundle **sources** live outside this repo, in the sibling `nexus-apps/`.

## Scripts

```
npm run dev              # vite dev server
npm run build            # standalone build (dist/)
npm run build:service    # build that nexus-service embeds
npm run preview          # preview the production build
npm start                # serve dist/ with the bundled Express server
npm run lint             # eslint
npm test                 # vitest unit tests (single run)
npm run test:watch       # vitest watch mode
npm run test:e2e         # playwright (run `npx playwright install` once first)
npm run test:e2e:ui      # playwright UI mode
npm run audit:locales    # locale key sync check
npm run audit:styles     # style audits (also: audit:css-chunks, audit:text-styles)
```

## Environment

- `VITE_SERVICE_HOST` / `VITE_SERVICE_PORT` / `VITE_SERVICE_PROTOCOL` -
  override how the app reaches the local service. Defaults to
  `127.0.0.1:9400`; the embedded build is same-origin.
- `VITE_API_URL` - cloud API origin. `npm run build:service` bakes in
  `https://api.hellonexus.com`; set this to point the embedded build at a
  local/staging API instead.
- `VITE_RELAY_URL` - relay origin override for local relay testing.

Host resolution logic lives in `src/api/service.ts`.

## Architecture

The authoritative transport, polling cadence, and WebSocket topic
inventory live in the `nexus-service` repo: `docs/network-transport.md`,
with the REST surface in `docs/api-spec.md`. Widget host architecture is
documented under `src/widgets/`.

## License

`nexus-web` is licensed under the **GNU Affero General Public License v3.0**
(AGPL-3.0); see [`LICENSE`](LICENSE) for the full text.

Copyright (C) 2026 Hello Nexus
