import { defineConfig, mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import viteConfig from './vite.config';

// The suite covers the shipped surface, so it runs as an official build whatever
// the machine has. The other shape is covered by files that mock
// lib/officialBuild - see src/search/providers.unofficial.test.ts.
export default mergeConfig(viteConfig, defineConfig({
  define: {
    __OFFICIAL_BUILD__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      // sdk/ is its own package with its own react@18 (the author-facing
      // worker tree runs an older React than the host's React 19 panel; see
      // sdk/runtime/context.tsx). Node resolution would otherwise hand a test
      // that renders sdk code a SECOND react module instance, which breaks
      // hooks (a separate dispatcher) under @testing-library/react's
      // React 19 renderer. Tests only - sdk/build.mjs's esbuild bundles the
      // real worker runtime against sdk/node_modules/react unaffected by this.
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
    },
  },
  test: {
    // Building a jsdom is the single largest cost in a run, and it is paid per
    // test file; a file that touches no DOM opts out with a
    // `// @vitest-environment node` docblock.
    environment: 'jsdom',
    // Threads share one process, so a worker costs less to start and to keep
    // resident than a fork. isolate stays on, so files still get a fresh module
    // registry.
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
