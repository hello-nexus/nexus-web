import { test, expect } from '@playwright/test';

const URL = '/?entry=/widgets/stopwatch/widget.mjs&id=com.hellonexus.stopwatch&w=220&h=220';

test('stopwatch SDK widget: real worker -> remote-dom -> host render', async ({ page }) => {
  const t0 = Date.now();
  await page.goto(URL);

  // Boot = worker spawn + bundle fetch + react render + first paint.
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeVisible({ timeout: 15_000 });
  const bootMs = Date.now() - t0;
  console.log(`[perf] boot to first interactive render: ${bootMs} ms`);

  const cell = page.locator('.cell');
  await expect(cell).toContainText(/00:00/);

  // Running: time advances.
  await start.click();
  const t1 = await cell.innerText();
  await page.waitForTimeout(700);
  const t2 = await cell.innerText();
  expect(t2).not.toBe(t1);

  // Pause: time holds. Button events are async (host -> worker RPC -> re-render),
  // so poll until the clock stabilizes, then assert it stays frozen.
  await page.getByRole('button', { name: 'Pause' }).click();
  let prev = '';
  let cur = await cell.innerText();
  for (let i = 0; i < 12 && prev !== cur; i++) {
    prev = cur;
    await page.waitForTimeout(120);
    cur = await cell.innerText();
  }
  const p1 = cur;
  await page.waitForTimeout(400);
  const p2 = await cell.innerText();
  expect(p2).toBe(p1);

  // Reset: back to zero.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(cell).toContainText(/^0?0:00/);

  expect(bootMs).toBeLessThan(8000);
});

test('local state persists across reload (host-backed)', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await page.locator('.cell').innerText();
  expect(paused).not.toMatch(/^00:00\.00/);

  await page.reload();
  await expect(page.locator('.cell')).toContainText(/\d\d:\d\d/);
  // The paused elapsed should survive the reload (non-zero).
  await expect(page.locator('.cell')).not.toContainText(/^00:00\.00$/);
});
