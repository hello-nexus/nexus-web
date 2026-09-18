// Drives the device page's canvas preview (/panel?simulator=1) with a real
// pointer: the widget marked immersive-on-load wears the lighting-canvas frame
// with the mark named under it while hovered, and nothing while not. Hover plus
// computed style is the layer a unit test cannot reach - the reveal is a
// `@media (hover: hover)` rule keyed on `.cellWrap:hover`, so the profile must
// stay a mouse one (hasTouch would report `hover: none`).

import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 700, height: 1000 } });

const WIDGET_ID = 'w-media-preview';
const OTHER_ID = 'w-clock-preview';
const MARK_LABEL = 'Immersive on load';
const EDIT_HINT = 'Edit widget';

const THEME = {
  appThemeMode: 'system',
  appResolvedThemeMode: '',
  themeSyncWithDesktop: true,
  themeMode: 'dark',
  appAccentColor: '#7dd3fc',
  accentSyncWithDesktop: true,
  accentColor: '',
  backgroundColor: '',
  backgroundColorLight: '',
  backgroundMode: 'solid',
  backgroundEffect: 'plasma',
  backgroundTemplate: 0,
  backgroundTemplates: {},
  backgroundOpacity: 1,
  backdrop: 'theme',
  backgroundEffectState: { speed: 0, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} },
  backgroundMediaId: null,
  backgroundMediaType: null,
  backgroundMediaAlpha: false,
  backgroundSlideshow: false,
  backgroundSlideshowInterval: 30,
  backgroundSlideshowShuffle: false,
  backgroundSlideshowFinishVideos: true,
  backgroundMediaOrder: [],
  backgroundFrost: 100,
  widgetOpacity: 1,
  widgetLabels: true,
  widgetPadding: 50,
};

// The device page always transform-scales the preview down to fit its column,
// so the shipping configuration is an upscale well above 1. Testing at 1 would
// exercise the one value that never reaches a user.
const SHIPPING_PREVIEW_SCALE = 0.4;

function initMessage(immersiveOnLoadWidgetId?: string, previewScale = SHIPPING_PREVIEW_SCALE) {
  return {
    type: 'simulator/init',
    previewScale,
    surface: 'y70',
    deviceTouch: true,
    layout: {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{
        id: 'p1',
        widgets: [
          { id: WIDGET_ID, type: 'media', size: '4x2', col: 0, row: 0 },
          { id: OTHER_ID, type: 'clock', size: '4x2', col: 0, row: 2 },
        ],
      }],
      immersiveOnLoadWidgetId,
    },
    theme: THEME,
    themeMode: 'dark',
    selectedWidgetId: null,
    brightness: 100,
    screenOn: true,
    showPanel: true,
  };
}

async function gotoPreview(page: Page, init: object) {
  await page.addInitScript(() => {
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/ping', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }),
  }));
  await page.goto('/panel?simulator=1');
  // The simulator renders nothing until the parent's init lands. Posting it from
  // the page itself gives the same origin useSimulatorLayoutState requires.
  await page.evaluate(msg => window.postMessage(msg, window.location.origin), init);
  await page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`).waitFor({ timeout: 15_000 });
}

function cell(page: Page, id: string) {
  return page.locator(`[data-panel-widget-id="${id}"]`);
}

// The frame is the cell's only boldly-bordered box. Matched on the shape the
// stylesheet gives it rather than a CSS-module hash.
function ringStyle(page: Page, id: string) {
  return page.evaluate(widgetId => {
    const host = document.querySelector(`[data-panel-widget-id="${widgetId}"]`);
    for (const el of Array.from(host?.querySelectorAll('div') ?? [])) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) < 3) continue;
      const rect = el.getBoundingClientRect();
      return {
        borderWidth: parseFloat(cs.borderTopWidth),
        borderColor: cs.borderTopColor,
        boxShadow: cs.boxShadow,
        opacity: cs.opacity,
        bottom: rect.bottom,
      };
    }
    return null;
  }, id);
}

function opacityOfText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).evaluate(el => getComputedStyle(el).opacity);
}

test.describe('immersive-on-load frame in the canvas preview', () => {
  test('hovering the marked widget reveals the frame and its name', async ({ page }) => {
    await gotoPreview(page, initMessage(WIDGET_ID));

    await expect(page.getByText(MARK_LABEL, { exact: true })).toHaveCount(1);
    expect(await opacityOfText(page, MARK_LABEL), 'hidden until the pointer arrives').toBe('0');

    await cell(page, WIDGET_ID).hover();
    await expect.poll(() => opacityOfText(page, MARK_LABEL)).toBe('1');

    // The same white rule with a dark halo on both sides that the lighting
    // canvas's device frames wear.
    const ring = await ringStyle(page, WIDGET_ID);
    expect(ring, 'the hovered mark must draw a bold ring').not.toBeNull();
    // Authored at 3px and divided by the preview's downscale, so it lands at
    // 3px on the operator's screen rather than sub-pixel. The computed value is
    // rounded to whole device pixels, hence the 1px tolerance.
    expect(Math.abs(ring!.borderWidth - 3 / SHIPPING_PREVIEW_SCALE)).toBeLessThanOrEqual(1);
    expect(ring!.borderColor).toBe('rgba(255, 255, 255, 0.95)');
    expect(ring!.boxShadow).toContain('inset');
    expect(ring!.opacity).toBe('1');

    // The name hangs BELOW the frame, never over it.
    const labelTop = await page.getByText(MARK_LABEL, { exact: true })
      .evaluate(el => el.getBoundingClientRect().top);
    expect(labelTop).toBeGreaterThanOrEqual(ring!.bottom - 1);
  });

  test('the marked cell keeps the click-to-edit hint alongside the frame', async ({ page }) => {
    await gotoPreview(page, initMessage(WIDGET_ID));

    await cell(page, WIDGET_ID).hover();
    await expect.poll(() => opacityOfText(page, MARK_LABEL)).toBe('1');
    // The mark is extra information about the cell, not a replacement for the
    // affordance that says it is click-to-edit.
    await expect(cell(page, WIDGET_ID).getByText(EDIT_HINT, { exact: true })).toHaveCount(1);

    // An unmarked cell keeps the hint and draws no frame.
    await cell(page, OTHER_ID).hover();
    await expect(cell(page, OTHER_ID).getByText(EDIT_HINT, { exact: true })).toHaveCount(1);
    expect(await ringStyle(page, OTHER_ID)).toBeNull();
  });

  test('the chip stays inside the pager, including on the last grid row', async ({ page }) => {
    // The chip escapes the cell box and the pager clips its overflow, so the
    // worst case is a marked widget with nothing but page padding beneath it.
    const init = initMessage(WIDGET_ID) as unknown as { layout: { pages: { widgets: unknown[] }[] } };
    init.layout.pages[0].widgets = [
      { id: OTHER_ID, type: 'clock', size: '4x2', col: 0, row: 0 },
      { id: WIDGET_ID, type: 'media', size: '4x2', col: 0, row: 12 },
    ];
    await gotoPreview(page, init);
    await cell(page, WIDGET_ID).hover();
    await expect.poll(() => opacityOfText(page, MARK_LABEL)).toBe('1');

    const box = await page.evaluate(label => {
      const chip = Array.from(document.querySelectorAll('div'))
        .find(d => d.textContent === label);
      const pager = document.querySelector('[class*="pager"]');
      if (!chip || !pager) return null;
      const c = chip.getBoundingClientRect();
      const p = pager.getBoundingClientRect();
      return { c: { top: c.top, bottom: c.bottom, left: c.left, right: c.right }, p: { top: p.top, bottom: p.bottom, left: p.left, right: p.right } };
    }, MARK_LABEL);
    expect(box).not.toBeNull();
    expect(box!.c.bottom, 'chip clipped by the pager bottom').toBeLessThanOrEqual(box!.p.bottom);
    expect(box!.c.left, 'chip clipped by the pager left edge').toBeGreaterThanOrEqual(box!.p.left);
    expect(box!.c.right, 'chip clipped by the pager right edge').toBeLessThanOrEqual(box!.p.right);

    // English never reaches the cap, so assert the cap itself is wired: a long
    // locale (ru/pl run ~1.5x) would otherwise run off both pager edges.
    const cap = await page.evaluate(label => {
      const chip = Array.from(document.querySelectorAll('div')).find(d => d.textContent === label);
      return chip ? getComputedStyle(chip).maxWidth : null;
    }, MARK_LABEL);
    expect(cap).not.toBe('none');
    expect(parseFloat(cap!)).toBeCloseTo(700 * SHIPPING_PREVIEW_SCALE, 0);
  });

  test('an unmarked layout draws no frame at all', async ({ page }) => {
    await gotoPreview(page, initMessage(undefined));

    await cell(page, WIDGET_ID).hover();
    await expect(page.getByText(MARK_LABEL, { exact: true })).toHaveCount(0);
    expect(await ringStyle(page, WIDGET_ID)).toBeNull();
    await expect(cell(page, WIDGET_ID).getByText(EDIT_HINT, { exact: true })).toHaveCount(1);
  });
});
