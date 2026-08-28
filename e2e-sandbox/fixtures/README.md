# SDK sandbox fixtures

Widget bundles `e2e-sandbox/server.mjs` serves at `/widgets/<id>/widget.mjs`, so
`npm run test:e2e:sandbox` runs against a bare nexus-web checkout with no apps
repo alongside it. They are fixtures, not shipped apps: the service bundles
only the apps repo's `apps/` tree, so nothing here reaches an install root.

Each directory holds the author source (`index.tsx`) and the built worker bundle
(`widget.mjs`) that the sandbox actually executes. `widget.mjs` is committed and
does not rebuild itself - regenerate it after editing the source:

```sh
node sdk/cli/nexus-app.mjs build e2e-sandbox/fixtures/<id>   # from the repo root
```

The suite needs the SDK runtime built once (`cd sdk && npm ci && npm run build`);
`server.mjs` says so and exits if it is missing.

Set `NEXUS_APPS_DIR=/path/to/apps-repo` to serve an external repo's `apps/<id>/`
builds instead of these.
