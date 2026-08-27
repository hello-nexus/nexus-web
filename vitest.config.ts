import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // jsdom construction dominated the run at ~0.6s per file; the 130 files
    // that touch no DOM opt out with a `// @vitest-environment node` docblock.
    environment: 'jsdom',
    // Threads share one process, so a worker costs far less to start and to
    // keep resident than a fork - the runner is memory-bound at 433 files.
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
