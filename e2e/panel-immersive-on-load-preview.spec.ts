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

function initMessage(immersiveOnLoadWidgetId?: string) {
  return {
    type: 'simulator/init',
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

// The frame is the cell's only 2px-bordered box. Matched on the shape the
// stylesheet gives it rather than a CSS-module hash.
function ringStyle(page: Page, id: string) {
  return page.evaluate(widgetId => {
    const host = document.querySelector(`[data-panel-widget-id="${widgetId}"]`);
    for (const el of Array.from(host?.querySelectorAll('div') ?? [])) {
      const cs = getComputedStyle(el);
      if (cs.borderTopWidth !== '2px') continue;
      return { borderColor: cs.borderTopColor, boxShadow: cs.boxShadow, opacity: cs.opacity };
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
    expect(ring, 'the hovered mark must draw a 2px ring').not.toBeNull();
    expect(ring!.borderColor).toBe('rgba(255, 255, 255, 0.85)');
    expect(ring!.boxShadow).toContain('inset');
    expect(ring!.opacity).toBe('1');
  });

  test('the marked cell shows the frame in place of the generic edit hint', async ({ page }) => {
    await gotoPreview(page, initMessage(WIDGET_ID));

    await cell(page, WIDGET_ID).hover();
    await expect.poll(() => opacityOfText(page, MARK_LABEL)).toBe('1');
    // The click-to-edit scrim would bury what the frame marks, so it is withheld
    // on this one cell.
    await expect(cell(page, WIDGET_ID).getByText(EDIT_HINT, { exact: true })).toHaveCount(0);

    // Every other cell keeps it.
    await cell(page, OTHER_ID).hover();
    const otherHint = cell(page, OTHER_ID).getByText(EDIT_HINT, { exact: true });
    await expect(otherHint).toHaveCount(1);
    await expect(await ringStyle(page, OTHER_ID)).toBeNull();
  });

  test('an unmarked layout draws no frame at all', async ({ page }) => {
    await gotoPreview(page, initMessage(undefined));

    await cell(page, WIDGET_ID).hover();
    await expect(page.getByText(MARK_LABEL, { exact: true })).toHaveCount(0);
    expect(await ringStyle(page, WIDGET_ID)).toBeNull();
    await expect(cell(page, WIDGET_ID).getByText(EDIT_HINT, { exact: true })).toHaveCount(1);
  });
});
