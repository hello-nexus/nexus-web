import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __SERVICE_BUILD__: JSON.stringify(isServiceBuild),
    __DEV_TOOLS__: JSON.stringify(devTools),
  },
  // The HYTE Q60 ships Android System WebView v83 (Chromium 83, June 2020).
  // Vite's default `modules` target uses class field declarations and other
  // ES2022 features that v83's V8 doesn't parse, leaving the panel blank on
  // the kiosk. Lowering to ES2019 covers Chromium 73+ and keeps the bundle
  // small. Y70 / desktop / phone all run modern Chromium/Edge, so they're
  // unaffected.
  build: {
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
