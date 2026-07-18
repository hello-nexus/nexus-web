# nexus-web

React + TypeScript + Vite dashboard for [Nexus](https://hellonexus.com). The same
bundle is shipped two ways:

- **Standalone web app** - served via the bundled Node server (`npm start`)
  or any static host. Serves hellonexus.com (marketing site) and
  my.hellonexus.com (the app surface) from one deployment; `server.js`
  routes `/` by host (see Surfaces below).
- **Service-embedded UI** - built into [`nexus-service`](https://github.com/hello-nexus/nexus-service)
  and served by the local service (Windows, macOS, Linux) on
  `http://127.0.0.1:9400` / `https://127.0.0.1:9443`. Builds with
  `npm run build:service`.

The **marketing site** is a second Vite entry (`site/index.html` ->
`src/site/`) that imports the app's real components (palette ring, shader
renderer, curve editor, gauges) as live demos on mock data. It is emitted only
by the standalone build - `npm run build:service` excludes the entry, so
marketing content never ships inside the desktop app.

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
npm run build      # outputs dist/ (SPA + dist/site/ marketing page)
npm start          # serves dist/ at http://localhost:3000 (override with PORT)
```

With `npm start`, `http://localhost:3000/` is the marketing page and
`http://my.localhost:3000/` is the app surface (browsers resolve
`*.localhost` to loopback). In `npm run dev` there is no host routing: the
SPA is at `/` and the marketing page at `/site/` (trailing slash).

Service-embedded build (normally triggered automatically by the
`nexus-service` build, which copies `dist/` into its `wwwroot/`):

```bash
npm run build:service
```

## Surfaces

The app routes a small set of top-level surfaces from the URL path:

| Path | Purpose |
|---|---|
| `/` | **Host-dependent** in the standalone deployment: `my.*` hosts (my.hellonexus.com, my.localhost) get the dashboard; every other host gets the marketing page (`dist/site/index.html`). Embedded/dev builds always serve the dashboard. On a remote origin without a reachable local service the dashboard shows the launch/download gate (`app/ServiceGatePage.tsx`). |
| `/panel/:deviceId` | Kiosk panel surface for embedded touchscreens. |
| `/panel/phone` | Mobile remote surface (paired via QR). |
| `/overlay` | Per-monitor overlay hosted by `nexus-overlay.exe`. |
| `/r/pair` | iOS Universal Link landing page (App Store / browser fallback). |
| `/u/:username` | Public account profile page. Browser-only. |
| `/auth/verify` | Email verification landing page. Browser-only. |
| `/auth/recover` | Lost-password magic-link landing page. Browser-only. |
| `/login` | Public sign-in page. Browser-only. |
| `/register` | Public account creation page. Browser-only. |
| `/recover` | Public lost-password request+poll flow. Browser-only. |
| `/account` | Public signed-in account page (profile management, no sync). Browser-only. |
| `/telemetry-reference` | Dev reference view listing the analytics events the app emits. |

`/touch` and `/panel/q60` are legacy aliases that land in the panel
allocation flow.

Only `/` is host-routed - every deeper path serves identically on all hosts,
so `/r/pair` QR links, `/panel/phone` relay-paired phones (whose session
tokens live under the hellonexus.com origin), and emailed `/auth/*` links
keep working unchanged.

`/download` serves the marketing downloads page (all platforms + latest
version). The canonical per-OS URLs `/download/windows|macos|linux` (and the
`win`/`mac` short forms) 302 to the newest downloadable release's asset,
resolved server-side via the GitHub releases API (latest stable, or the
newest prerelease while no stable exists - GitHub's static `latest/download`
alias 404s until then).

`/u/:username`, `/auth/verify`, `/auth/recover`, `/login`, `/register`,
`/recover`, and `/account` are dead-code-eliminated from `npm run
build:service` (same `__SERVICE_BUILD__` build-define technique as the
`__DEV_TOOLS__` gate) - they only ever ship in the standalone build served at
hellonexus.com. `server.js` additionally injects og:title/og:image/
description meta tags into `/u/:username` responses for link previews, backed
by a short-lived in-memory cache of the nexus-api lookup (`NEXUS_API_BASE`,
below).

`/login`, `/register`, `/recover`, and `/account` render the same
sign-in/register/recovery/account-management components as the in-app
Settings > Account view, swapped onto an `AuthBackend` adapter that talks to
`api.hellonexus.com` directly (`api/directApiBackend.ts`) instead of the
in-app adapter that proxies through the local service
(`api/localServiceBackend.ts`).

## Project layout

Everything ships from `src/`. Top-level folders:

| Folder | Contents |
|---|---|
| `api/` | Typed REST/WS clients for `nexus-service` + the cloud API - one file per domain (`cooling`, `lighting`, `displays`, `keeb`, `gallery`, `panel`, `internetPairing`…). Host resolution lives in `api/service.ts`. |
| `app/` | Desktop **dashboard shell**: `Dashboard.tsx`, sidebar, pairing modals, panel entrypoint + routing, window caption buttons. `app/public/` holds the browser-only public account pages (see Surfaces above). |
| `assets/` | Static image assets bundled into the app (e.g. `flags/` for locale flags). |
| `components/` | Shared React components - `common/` (design-system primitives), `views/` (full dashboard sections), `peripherals/`, `icons/`. |
| `diag/` | Renderer diagnostics - the memory/health probe that reports JS-heap, DOM-node, and reconnect samples to the service log (`/diagnostics/client-mem`) on significant change. |
| `hooks/` | Reusable hooks, mostly data/state (`useDevices`, `useCooling`, `useMultiplexSocket`…). |
| `lib/` | Non-React utilities + stores (`appStore`, `monitoringStore`, `i18n`, `settings`, `webhid/`, codecs, sensor resolvers). |
| `locales/` | The i18n JSON bundles (en + 15 others). |
| `overlay/` | The `/overlay` surface - per-monitor overlay shell + bridge to `nexus-overlay.exe`. |
| `panel/` | The kiosk/phone **panel** surface and its own rendering engine (`engine/`, `editor/`, `chrome/`, `theme/`, `dnd/`, `background/`, `overlays/`, `embed/` simulator). `panel/widgets/` holds the built-in widget implementations. |
| `sandbox/` | Host runtime for **sandboxed SDK widgets** ("Nexus apps"): boots a hardened Web Worker per widget, installs the `nexus.*` API, and renders the worker's remote-dom tree. This is what executes third-party app bundles. |
| `search/` | Global command palette / top search (providers, fuzzy match, frecency). |
| `site/` | The **marketing site** (`site/index.html` entry at the repo root -> `src/site/`): long-scroll landing page whose feature demos mount the app's real components on mock data. Standalone build only. Bundled shader copies live in `src/site/shaders/` (see its README). |
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
- `VITE_API_URL` - cloud API origin override. The compiled-in default is
  `https://api.hellonexus.com`, so every production build works without it;
  the committed `.env.development` points `npm run dev` at
  `http://localhost:3000`. Set it explicitly to target a local/staging API
  from a build.
- `VITE_RELAY_URL` - relay origin override for local relay testing.
- `VITE_LAN_SEALED` - set to `1` to force the LAN-sealed transport (also
  toggleable at runtime via `localStorage['nexus.lanSealed']`). Debug flag.
- `NEXUS_API_BASE` - `server.js`-only (not a Vite define): the nexus-api
  origin `/u/:username` OG injection fetches against. Defaults to
  `https://api.hellonexus.com`.

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
