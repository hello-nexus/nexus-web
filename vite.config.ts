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
})
