import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
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
