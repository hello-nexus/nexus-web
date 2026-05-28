import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const commitCount = (() => {
  try { return execSync('git rev-list --count HEAD').toString().trim() }
  catch { return '0' }
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
    __APP_VERSION__: JSON.stringify(`v${commitCount}`),
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
  },
})
