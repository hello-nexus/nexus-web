import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const commitCount = (() => {
  try { return execSync('git rev-list --count HEAD').toString().trim() }
  catch { return '0' }
})()

const isServiceBuild = process.env.BUILD_TARGET === 'service'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${commitCount}`),
    __SERVICE_BUILD__: JSON.stringify(isServiceBuild),
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
