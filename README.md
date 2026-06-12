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
- `VITE_API_URL` - cloud API origin override.
- `VITE_RELAY_URL` - relay origin override for local relay testing.

Host resolution logic lives in `src/api/service.ts`.

## Architecture

The authoritative transport, polling cadence, and WebSocket topic
inventory live in the `nexus-service` repo: `docs/network-transport.md`,
with the REST surface in `docs/api-spec.md`. Widget host architecture is
documented under `src/widgets/`.
