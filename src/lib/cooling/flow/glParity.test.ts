// @vitest-environment node
/**
 * Runs the real GLSL against the CPU reference in headless Chromium with software GL. Opt in:
 *
 *   FLOW_GL=1 npx vitest run src/lib/cooling/flow/glParity.test.ts
 *
 * FLOW_GL_FRAMES=<n> shortens the particle run on a slow software renderer.
 *
 * Needs a Chromium binary: playwright's own (`npx playwright install chromium`), or CHROME=<path to chrome-headless-shell or chrome>.
 * Serves glParity.harness.html through a throwaway vite server, so it needs no running dev server and touches no ports but a random one.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';

const enabled = process.env.FLOW_GL === '1';
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

describe.skipIf(!enabled)('GLSL solver and particles on software GL', () => {
  it('matches the CPU reference, keeps particles out of solids across a grid change, and times without a stalled frame', async () => {
    const server = await createServer({ server: { port: 0, hmr: false }, logLevel: 'error' });
    await server.listen();
    const address = server.httpServer!.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const executablePath = process.env.CHROME ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
    const browser = await chromium.launch({ executablePath, args: GL_ARGS });
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/src/lib/cooling/flow/glParity.harness.html${process.env.FLOW_GL_FRAMES ? `?frames=${process.env.FLOW_GL_FRAMES}` : ''}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.title === 'done', null, { timeout: 460000 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: Record<string, any> = await page.evaluate(() => (window as unknown as { __flowGl: Record<string, unknown> }).__flowGl);
      expect(r.exception).toBeUndefined();
      expect(r.supported).toBe(true);
      expect(r.consoleErrors).toEqual([]);
      expect(r.trail).toEqual([]);
      expect(r.glError).toBe(0);
      if (r.float32) expect(r.velocity.maxDiff).toBeLessThan(1e-3);
      // Streak tail endpoints (head minus direction times length) and lengths agree with streak.ts to float precision.
      if (r.float32) { expect(r.streak.n).toBe(256); expect(r.streak.maxDiff).toBeLessThan(1e-3); }
      expect(r.velocity.maxCpu).toBeGreaterThan(0.1);
      expect(Number.isFinite(r.measure.u)).toBe(true);
      expect(r.measure.u).toBeGreaterThan(0.1);
      expect(r.particles.checked).toBeGreaterThan(1000);
      expect(r.particles.inSolidOrOutside).toBe(0);
      expect(r.afterTierDrop.tier).toBe(r.particles.tier + 1);
      expect(r.afterTierDrop.checked).toBeGreaterThan(1000);
      expect(r.afterTierDrop.inSolidOrOutside).toBe(0);
      // The visible speed: particles within a fan diameter downstream of a 500 rpm fan move 0.45 to 0.6 as far per frame as those of a 2500 rpm fan on the same face.
      expect(r.visibleSpeed.centers).toBe(2);
      expect(r.visibleSpeed.counts[0]).toBeGreaterThan(100);
      expect(r.visibleSpeed.counts[1]).toBeGreaterThan(100);
      expect(r.visibleSpeed.means[0]).toBeGreaterThan(0.02);
      expect(r.visibleSpeed.means[0] / r.visibleSpeed.means[1]).toBeGreaterThan(0.45);
      expect(r.visibleSpeed.means[0] / r.visibleSpeed.means[1]).toBeLessThan(0.6);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 480000);
});
