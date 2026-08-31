import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import hoverGuard from './scripts/hover-guard-postcss'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const appVersion = (() => {
  try {
    return 'v' + readFileSync(resolve(__dirname, 'VERSION'), 'utf8').trim();
  } catch {
    return 'v0.0.0';
  }
})()

const isServiceBuild = process.env.BUILD_TARGET === 'service'

// Internal/test builds opt in with DEV_TOOLS=1 to include the firmware
// downgrade / cross-branch flashing UI. Off by default so release bundles
// dead-code-eliminate the brick-capable path; the dev server enables it
// automatically via import.meta.env.DEV at the use site.
const devTools = process.env.DEV_TOOLS === '1'

// Presence of the build credential is the single switch for the cloud surfaces.
// Resolution matches Nexus.Service.csproj's env-then-file order; the csproj also
// accepts -p:NexusClientToken=, which a publish passing it must therefore also
// export here or the halves disagree. Only this boolean reaches the bundle.
const officialBuild = (() => {
  if (process.env.NEXUS_CLIENT_TOKEN) return true;
  const home = process.env.USERPROFILE || process.env.HOME
  if (!home) return false;
  try {
    return readFileSync(resolve(home, '.nexus-build', 'client-token'), 'utf8').trim().length > 0;
  } catch {
    return false;
  }
})()

export default defineConfig({
  plugins: [react()],
  // Runs after the sass preprocessor, so it sees resolved selectors rather
  // than the `&:hover` most of them are authored as. Pairs with
  // src/lib/hoverGuard.ts.
  css: { postcss: { plugins: [hoverGuard()] } },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __SERVICE_BUILD__: JSON.stringify(isServiceBuild),
    __DEV_TOOLS__: JSON.stringify(devTools),
    __OFFICIAL_BUILD__: JSON.stringify(officialBuild),
  },
  // The HYTE Q60 ships Android System WebView v83 (Chromium 83, June 2020).
  // Vite's default `modules` target uses class field declarations and other
  // ES2022 features that v83's V8 doesn't parse, leaving the panel blank on
  // the kiosk. Lowering to ES2019 covers Chromium 73+ and keeps the bundle
  // small. Y70 / desktop / phone all run modern Chromium/Edge, so they're
  // unaffected.
  build: {
    // `cssTarget` inherits this. It MUST keep a Safari/iOS target: no source
    // hand-writes `-webkit-backdrop-filter` (doing so makes lightningcss drop
    // the unprefixed property and kills the effect on Blink), so this target is
    // the only thing emitting the prefix iOS WKWebView needs. Setting
    // cssTarget:'esnext' or cssMinify:'esbuild' silently unfrosts iOS.
    target: 'es2019',
    // The marketing site (site/index.html, served at hellonexus.com's root by
    // server.js host routing) is a second entry in the standalone build only.
    // The service build must emit the SPA alone: the csproj BuildWebForService
    // target copies dist/** verbatim into the shipped app's wwwroot, and
    // marketing content must never ride along.
    rollupOptions: {
      input: isServiceBuild
        ? resolve(__dirname, 'index.html')
        : {
            app: resolve(__dirname, 'index.html'),
            site: resolve(__dirname, 'site/index.html'),
          },
    },
  },
})
