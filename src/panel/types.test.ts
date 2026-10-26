// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canEditFreeText, effectiveClickThrough, isGenericDisplayPanel, isStreamedPanelSurface, normalizeGridSlots, panelCanvasEditable, panelLayoutDpi, panelLayoutSurface, panelShortSideSlots, panelWidgetSizeOptions, resolvePanelWidgetSize, surfaceAllowsPages,
  surfaceDisplayShape, surfaceInputMode, widgetDisplayShape, type PanelSurface,
} from './types';

describe('surfaceInputMode', () => {
  it('maps every surface to its input method', () => {
    const cases: Array<[PanelSurface, boolean | undefined, ReturnType<typeof surfaceInputMode>]> = [
      ['desktop', undefined, 'pointer'],
      ['y70', undefined, 'touch'],
      ['phone', undefined, 'touch'],
      ['q60', undefined, 'none'],
      ['lcd-round', undefined, 'none'],
      ['lcd-square', undefined, 'none'],
      ['lcd-wide', undefined, 'none'],
      ['monitor', undefined, 'none'],
      ['monitor', false, 'none'],
      ['monitor', true, 'touch'],
    ];
    for (const [surface, deviceTouch, expected] of cases) {
      expect(surfaceInputMode(surface, deviceTouch)).toBe(expected);
    }
  });
});

describe('widgetDisplayShape', () => {
  it('is round only for the 2x2round tile', () => {
    expect(widgetDisplayShape('2x2round')).toBe('round');
    expect(widgetDisplayShape('1x1')).toBe('rect');
    expect(widgetDisplayShape('2x2')).toBe('rect');
    expect(widgetDisplayShape('4x4')).toBe('rect');
  });
});

describe('isStreamedPanelSurface', () => {
  it('is always streamed for the pushed-frame device surfaces, regardless of displayBound', () => {
    for (const surface of ['lcd-round', 'lcd-square', 'lcd-wide', 'q60'] as const) {
      expect(isStreamedPanelSurface(surface)).toBe(true);
      expect(isStreamedPanelSurface(surface, false)).toBe(true);
      expect(isStreamedPanelSurface(surface, true)).toBe(true);
    }
  });

  it('is never streamed for the interactive kiosk surfaces', () => {
    for (const surface of ['y70', 'phone', 'desktop'] as const) {
      expect(isStreamedPanelSurface(surface)).toBe(false);
      expect(isStreamedPanelSurface(surface, false)).toBe(false);
    }
  });

  it('distinguishes a streamed D213 monitor from a real promoted monitor by displayBound', () => {
    // Both use the 'monitor' surface id; only displayBound (PanelDeviceRecord.displayId) tells them apart.
    expect(isStreamedPanelSurface('monitor', false)).toBe(true);
    expect(isStreamedPanelSurface('monitor', true)).toBe(false);
    // Default (no signal available) assumes a real display, not a streamed capture.
    expect(isStreamedPanelSurface('monitor')).toBe(false);
  });
});

describe('Widget size', () => {
  it('lays the Q-series and the iCUE LINK 5" LCD out as one tile when large and a grid when small', () => {
    expect(panelLayoutSurface('q60', undefined, null)).toBe('q60');
    expect(panelLayoutSurface('q60', undefined, 'small')).toBe('monitor');
    expect(panelLayoutSurface('monitor', 'icue-link-lcd5', null)).toBe('monitor');
    expect(panelLayoutSurface('monitor', 'icue-link-lcd5', 'large')).toBe('q60');
  });

  it('defaults each panel to the size it has always had', () => {
    expect(resolvePanelWidgetSize('q60', undefined, undefined)).toBe('large');
    expect(resolvePanelWidgetSize('monitor', 'icue-link-lcd5', undefined)).toBe('small');
    expect(resolvePanelWidgetSize('q60', undefined, 'bogus')).toBe('large');
  });

  it('lays the HydroShift II Curved out as its wide tile when large and a dense grid when small', () => {
    const surfaceDpi = { q60: 220, monitor: 110 } as Record<PanelSurface, number>;
    expect(panelLayoutSurface('lcd-wide', 'lianli-hydroshift2-curve', null)).toBe('lcd-wide');
    expect(panelLayoutSurface('lcd-wide', 'lianli-hydroshift2-curve', 'small')).toBe('monitor');
    expect(panelLayoutDpi('lcd-wide', 'lianli-hydroshift2-curve', 'small', null, surfaceDpi)).toBe(379);
    expect(panelLayoutDpi('lcd-wide', 'lianli-hydroshift2-curve', 'large', null, surfaceDpi)).toBeUndefined();
    expect(panelLayoutDpi('q60', undefined, 'small', null, surfaceDpi)).toBe(220);
    expect(panelLayoutDpi('monitor', 'icue-link-lcd5', 'small', 294, surfaceDpi)).toBe(294);
    // Other wide cooler glass keeps its one tile.
    expect(panelWidgetSizeOptions('lcd-wide', undefined)).toBeUndefined();
  });

  it('lays the ASUS Glacial LCD out as its one tile when large and a monitor grid when small', () => {
    expect(resolvePanelWidgetSize('lcd-square', 'asus-glacial-lcd', null)).toBe('large');
    expect(panelLayoutSurface('lcd-square', 'asus-glacial-lcd', null)).toBe('lcd-square');
    expect(panelLayoutSurface('lcd-square', 'asus-glacial-lcd', 'small')).toBe('monitor');
    // Other square cooler glass keeps its one tile.
    expect(panelWidgetSizeOptions('lcd-square', undefined)).toBeUndefined();
    expect(panelWidgetSizeOptions('lcd-square', 'asus-ryujin-lcd')).toBeUndefined();
  });

  it('halves the Lian Li 8.8 short-axis slots when large and changes nothing when small', () => {
    expect(panelShortSideSlots('monitor', 'lianli-screen88', 'large')).toBe(2);
    expect(panelShortSideSlots('monitor', 'lianli-screen88', 'small')).toBeUndefined();
    expect(panelShortSideSlots('monitor', 'lianli-screen88', null)).toBeUndefined();
    expect(panelLayoutSurface('monitor', 'lianli-screen88', 'large')).toBe('monitor');
    expect(panelShortSideSlots('monitor', 'icue-link-lcd5', 'large')).toBeUndefined();
    expect(panelShortSideSlots('q60', undefined, 'large')).toBeUndefined();
  });

  it('starts a plain monitor small on its density grid, and large halves its short axis', () => {
    expect(resolvePanelWidgetSize('monitor', undefined, null)).toBe('small');
    expect(resolvePanelWidgetSize('monitor', null, 'large')).toBe('large');
    expect(panelShortSideSlots('monitor', undefined, null, 12)).toBeUndefined();
    expect(panelShortSideSlots('monitor', undefined, 'large', 12)).toBe(6);
    expect(panelShortSideSlots('monitor', undefined, 'large', 8)).toBe(4);
    expect(panelShortSideSlots('monitor', undefined, 'large', 4)).toBe(2);
    expect(panelShortSideSlots('monitor', undefined, 'large')).toBeUndefined();
    expect(panelLayoutSurface('monitor', undefined, 'large')).toBe('monitor');
    expect(panelLayoutDpi('monitor', undefined, 'large', null, { monitor: 110 } as Record<PanelSurface, number>)).toBeUndefined();
  });

  it('is not offered elsewhere, whatever a record carries', () => {
    expect(panelWidgetSizeOptions('monitor', 'xeneon-edge')).toBeUndefined();
    expect(panelWidgetSizeOptions('y70', undefined)).toBeUndefined();
    expect(panelLayoutSurface('y70', undefined, 'small')).toBe('y70');
    expect(resolvePanelWidgetSize('phone', undefined, 'large')).toBeUndefined();
  });
});

describe('surfaceAllowsPages', () => {
  it('allows pages only where the glass can be swiped', () => {
    expect(surfaceAllowsPages('y70')).toBe(true);
    expect(surfaceAllowsPages('phone')).toBe(true);
    expect(surfaceAllowsPages('monitor', true)).toBe(true);
    expect(surfaceAllowsPages('monitor', false)).toBe(false);
    expect(surfaceAllowsPages('monitor')).toBe(false);
    expect(surfaceAllowsPages('q60')).toBe(false);
  });

  it('gives a display-bound multi-widget panel a clickable pager, never single-tile glass', () => {
    expect(surfaceAllowsPages('monitor', false, true)).toBe(true);
    expect(surfaceAllowsPages('monitor', undefined, true)).toBe(true);
    expect(surfaceAllowsPages('q60', false, true)).toBe(false);
    expect(surfaceAllowsPages('lcd-round', false, true)).toBe(false);
  });
});

describe('panelCanvasEditable', () => {
  it('keeps the preview rule and the touch rule', () => {
    expect(panelCanvasEditable('monitor', false, true)).toBe(true);
    expect(panelCanvasEditable('q60', false, true)).toBe(false);
    expect(panelCanvasEditable('y70', undefined, false)).toBe(true);
    expect(panelCanvasEditable('monitor', true, false)).toBe(true);
  });

  it('lets the mouse edit a display-bound multi-widget panel on the glass', () => {
    expect(panelCanvasEditable('monitor', false, false)).toBe(false);
    expect(panelCanvasEditable('monitor', false, false, true)).toBe(true);
    expect(panelCanvasEditable('monitor', undefined, false, true)).toBe(true);
    expect(panelCanvasEditable('q60', false, false, true)).toBe(false);
    expect(panelCanvasEditable('lcd-square', false, false, true)).toBe(false);
  });
});

describe('grid density override', () => {
  it('rounds to an even count within 2 to 64', () => {
    expect(normalizeGridSlots(18)).toBe(18);
    expect(normalizeGridSlots(17)).toBe(18);
    expect(normalizeGridSlots(0)).toBeUndefined();
    expect(normalizeGridSlots(1)).toBe(2);
    expect(normalizeGridSlots(500)).toBe(64);
    expect(normalizeGridSlots(null)).toBeUndefined();
    expect(normalizeGridSlots(Number.NaN)).toBeUndefined();
  });
});

describe('surfaceDisplayShape', () => {
  it('is round only on round displays', () => {
    expect(surfaceDisplayShape('lcd-round')).toBe('round');
    for (const surface of ['lcd-square', 'lcd-wide', 'q60', 'y70', 'monitor', 'phone', 'desktop'] as const) {
      expect(surfaceDisplayShape(surface)).toBe('rect');
    }
  });
});

describe('canEditFreeText', () => {
  afterEach(() => vi.unstubAllGlobals());
  const withWindow = (w: object) => vi.stubGlobal('window', w);

  it('is on for a monitor surface under a WebView2 or WKWebView kiosk host', () => {
    withWindow({ chrome: { webview: { postMessage: () => {} } } });
    expect(canEditFreeText('monitor')).toBe(true);
    withWindow({ webkit: { messageHandlers: { nexusPanel: { postMessage: () => {} } } } });
    expect(canEditFreeText('monitor')).toBe(true);
  });

  it('is off for a monitor surface with no host (streamed capture)', () => {
    withWindow({});
    expect(canEditFreeText('monitor')).toBe(false);
  });

  it('stays off for keyboardless surfaces even with a host', () => {
    withWindow({ chrome: { webview: { postMessage: () => {} } } });
    for (const s of ['y70', 'q60', 'lcd-round', 'lcd-square', 'lcd-wide'] as PanelSurface[]) {
      expect(canEditFreeText(s)).toBe(false);
    }
  });

  it('keeps desktop and phone on', () => {
    withWindow({});
    expect(canEditFreeText('desktop')).toBe(true);
    expect(canEditFreeText('phone')).toBe(true);
  });
});

describe('effectiveClickThrough', () => {
  it('forces click-through on a generic display while always on top', () => {
    expect(effectiveClickThrough(false, true, true)).toBe(true);
    expect(effectiveClickThrough(true, true, true)).toBe(true);
  });

  it('keeps the stored choice once always on top is off', () => {
    expect(effectiveClickThrough(false, false, true)).toBe(false);
    expect(effectiveClickThrough(true, false, true)).toBe(true);
  });

  it('leaves a known device on its stored choice', () => {
    expect(effectiveClickThrough(false, true, false)).toBe(false);
    expect(effectiveClickThrough(true, true, false)).toBe(true);
  });
});

describe('isGenericDisplayPanel and pages', () => {
  it('is true only for a display-bound monitor with no curated family', () => {
    expect(isGenericDisplayPanel('monitor', undefined, true)).toBe(true);
    expect(isGenericDisplayPanel('monitor', 'xeneon-edge', true)).toBe(false);
    expect(isGenericDisplayPanel('monitor', 'icue-link-lcd5', true)).toBe(false);
    expect(isGenericDisplayPanel('monitor', undefined, false)).toBe(false);
    for (const s of ['y70', 'q60', 'phone', 'desktop', 'lcd-round', 'lcd-square', 'lcd-wide'] as PanelSurface[]) {
      expect(isGenericDisplayPanel(s, undefined, true)).toBe(false);
    }
  });

  it('gives a generic display one page and leaves a known display its pages', () => {
    expect(surfaceAllowsPages('monitor', true, true, true)).toBe(false);
    expect(surfaceAllowsPages('monitor', false, true, true)).toBe(false);
    expect(surfaceAllowsPages('monitor', false, true, false)).toBe(true);
    expect(surfaceAllowsPages('monitor', true, true, false)).toBe(true);
    expect(surfaceAllowsPages('y70', undefined, false, false)).toBe(true);
    expect(surfaceAllowsPages('phone', undefined, false, false)).toBe(true);
  });
});

describe('widget size options for a plain display', () => {
  it('offers large, small and extra small, scaling the density grid', async () => {
    const { panelWidgetSizeOptions, panelShortSideSlots, panelLayoutSurface, resolvePanelWidgetSize } = await import('./types');
    const options = panelWidgetSizeOptions('monitor', undefined);
    expect(Object.keys(options!.layoutSurface).sort()).toEqual(['large', 'small', 'xsmall']);
    expect(panelShortSideSlots('monitor', undefined, 'large', 12)).toBe(6);
    expect(panelShortSideSlots('monitor', undefined, 'small', 12)).toBeUndefined();
    expect(panelShortSideSlots('monitor', undefined, 'xsmall', 12)).toBe(24);
    expect(panelShortSideSlots('monitor', undefined, 'xsmall', 60)).toBe(64);
    expect(resolvePanelWidgetSize('monitor', undefined, 'xsmall')).toBe('xsmall');
    expect(panelLayoutSurface('monitor', undefined, 'xsmall')).toBe('monitor');
  });

  it('does not offer extra small on a curated display or a tile panel', async () => {
    const { panelWidgetSizeOptions, resolvePanelWidgetSize } = await import('./types');
    expect(panelWidgetSizeOptions('monitor', 'lianli-screen88')!.layoutSurface.xsmall).toBeUndefined();
    expect(panelWidgetSizeOptions('q60')!.layoutSurface.xsmall).toBeUndefined();
    expect(resolvePanelWidgetSize('q60', undefined, 'xsmall')).toBe('large');
  });

  it('maps a retired grid density to the nearest size', async () => {
    const { sizeForLegacyGridSlots } = await import('./types');
    expect(sizeForLegacyGridSlots(6, 12)).toBe('large');
    expect(sizeForLegacyGridSlots(12, 12)).toBe('small');
    expect(sizeForLegacyGridSlots(10, 12)).toBe('small');
    expect(sizeForLegacyGridSlots(26, 12)).toBe('xsmall');
    expect(sizeForLegacyGridSlots(0, 12)).toBeUndefined();
    expect(sizeForLegacyGridSlots(12, undefined)).toBeUndefined();
  });
});
