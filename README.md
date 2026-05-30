# nexus-web

React + TypeScript + Vite dashboard for [Nexus](https://hellonexus.com). The same
bundle is shipped two ways:

- **Standalone web app** — served via the bundled Node server (`npm start`)
  or any static host. Used during development and for the marketing demo.
- **Service-embedded UI** — built into `nexus-service` and served from the
  local Windows service on `http://127.0.0.1:9400` / `https://127.0.0.1:9443`.
  Builds with `npm run build:service`.

## Surfaces

The app routes a small set of top-level surfaces from the URL path:

| Path | Purpose |
|---|---|
| `/` | Dashboard (desktop). Connects to nexus-service over REST + WS. |
| `/panel/:deviceId` | Kiosk panel surface for embedded touchscreens. |
| `/panel/phone` | Mobile remote surface (paired via QR). |
| `/overlay` | Per-monitor overlay hosted by `nexus-overlay.exe`. |
| `/r/pair` | iOS Universal Link landing page (App Store / browser fallback). |
| `/snapshot-harness` | Dev-only Playwright visual-parity fixture. |

## Scripts

```
npm run dev              # vite dev server
npm run build            # standalone build (dist/)
npm run build:service    # build that nexus-service embeds
npm run lint
npm test                 # vitest unit
npm run test:e2e         # playwright
```

## Environment

Vite-side env vars (`VITE_*`) and runtime probing in `src/api/service.ts`
resolve the service host. Local development typically uses
`http://127.0.0.1:9400`; the embedded build is same-origin.

## Architecture

See `nexus/docs/network-transport.md` in the parent nexus workspace (or
`nexus-service/docs/network-transport.md` here as a submodule) for the
authoritative transport, polling cadence, and WebSocket topic inventory.
Widget host architecture is documented under `src/widgets/` and
`nexus-service/docs/api-spec.md`.
