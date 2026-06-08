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

test('clock SDK widget: settings + Intl time render and tick', async ({ page }) => {
  const s = encodeURIComponent(JSON.stringify({ showSeconds: true, format: '24h', showDate: true }));
  await page.goto(`/?entry=/widgets/clock/widget.mjs&id=com.hellonexus.clock&w=240&h=160&s=${s}`);
  const cell = page.locator('.cell');
  await expect(cell).toContainText(/\d\d:\d\d:\d\d/, { timeout: 15_000 });
  const a = await cell.innerText();
  await page.waitForTimeout(1300);
  const b = await cell.innerText();
  expect(b).not.toBe(a); // seconds advanced
});

test('timer SDK widget: setup steppers -> run -> countdown -> stop', async ({ page }) => {
  await page.goto('/?entry=/widgets/timer/widget.mjs&id=com.hellonexus.timer&w=260&h=200');
  // Setup phase: default 5 minutes -> Start enabled.
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();

  const cell = page.locator('.cell');
  await expect(cell).toContainText(/0?[45]:\d\d/, { timeout: 5_000 }); // ~05:00 counting down
  const t1 = await cell.innerText();
  await page.waitForTimeout(1100);
  const t2 = await cell.innerText();
  expect(t2).not.toBe(t1); // counting down

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible(); // back to setup
});

test('weather SDK widget: brokered fetch -> geolocation + forecast render', async ({ page }) => {
  await page.goto('/?entry=/widgets/weather/widget.mjs&id=com.hellonexus.weather&w=320&h=370&nf=api.open-meteo.com,ipwho.is');
  const cell = page.locator('.cell');
  await expect(cell).toContainText('72°', { timeout: 15_000 }); // current temp via mock OpenMeteo
  await expect(cell).toContainText('Partly cloudy');
  await expect(cell).toContainText('Los Angeles');          // ipwho.is geolocation
  await expect(cell).toContainText('Today');                // 5-day forecast
  await expect(cell).toContainText('Fri');
  await expect(cell).toContainText(/H:78° L:60°/);
});

test('blob-URL bundle load (the remote-panel path): worker imports a blob: module', async ({ page }) => {
  await page.goto('/?entry=/widgets/stopwatch/widget.mjs&id=com.hellonexus.stopwatch&w=220&h=180&blob=1');
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeVisible({ timeout: 15_000 });
  const cell = page.locator('.cell');
  await expect(cell).toContainText(/00:00/);
  await start.click();
  const t1 = await cell.innerText();
  await page.waitForTimeout(600);
  expect(await cell.innerText()).not.toBe(t1); // worker booted from a blob: import and ticks
});

test('screentime SDK widget: host-action dispatch data path', async ({ page }) => {
  await page.goto('/?entry=/widgets/screentime/widget.mjs&id=com.hellonexus.screentime.sdk&w=360&h=360');
  const cell = page.locator('.cell');
  await expect(cell).toContainText('3h 30m', { timeout: 15_000 });   // total via screentime.today
  await expect(cell).toContainText('Visual Studio Code');            // focus + #1 app
  await expect(cell).toContainText('Active now');                    // focus highlight
  await expect(cell).toContainText('Slack');                         // ranked list
  await expect(cell).toContainText('43%'); // VS Code = 5.4M/12.6M of the day
});

test('displays SDK widget: host-action data + control (setBrightness dispatch)', async ({ page }) => {
  const dispatched: string[] = [];
  await page.route('**/widgets-api/dispatch', async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    if (body.action === 'displays.setBrightness') dispatched.push(JSON.stringify(body.args));
    await route.continue();
  });
  await page.goto('/?entry=/widgets/displays/widget.mjs&id=com.hellonexus.displays.sdk&w=360&h=300');
  const cell = page.locator('.cell');
  await expect(cell).toContainText('Dell U2720Q', { timeout: 15_000 });
  await expect(cell).toContainText('LG 27GP950');
  await expect(cell).toContainText('75%'); // current brightness via displays.list
  // drive a brightness write
  const slider = cell.locator('input[type=range]').first();
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  expect(dispatched.some((a) => /setBrightness|value/i.test(a) || a.includes('value'))).toBeTruthy();
});
