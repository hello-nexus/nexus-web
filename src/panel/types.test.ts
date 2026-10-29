// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canEditFreeText, hostedDisplayKeyboard, surfaceSupportsTextInput, isGenericDisplayPanel, isStreamedPanelSurface, normalizeGridSlots, panelCanvasEditable, panelLayoutDpi, panelLayoutSurface, panelShortSideSlots, panelWidgetSizeOptions, resolvePanelWidgetSize, surfaceAllowsPages, genericSinglePage, isSingleWidgetSurface, LIANLI_SCREEN88_FAMILY,
  cellInputOf, surfaceDisplayShape, surfaceInputMode, surfaceSupportsTouch, widgetDisplayShape, widgetInputOf, largeChromeGrid, type PanelSurface,
} from './types';
import { panelGridCapacityForCanvas } from './engine/grid';

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

describe('widgetInputOf', () => {
  it('gives a display-bound panel input whatever the digitizer says', () => {
    for (const touch of [undefined, false, true]) {
      expect(widgetInputOf(touch, true)).toBe(true);
      expect(surfaceSupportsTouch('monitor', widgetInputOf(touch, true))).toBe(true);
      expect(surfaceInputMode('monitor', widgetInputOf(touch, true))).not.toBe('none');
    }
  });

  it('passes the digitizer through off a display-bound panel', () => {
    expect(widgetInputOf(undefined, false)).toBeUndefined();
    expect(widgetInputOf(false, false)).toBe(false);
    expect(widgetInputOf(true, false)).toBe(true);
    expect(surfaceInputMode('q60', widgetInputOf(undefined, false))).toBe('none');
  });
});

describe('cellInputOf', () => {
  it('gives a generic display input, whatever the digitizer says', () => {
    for (const touch of [undefined, false, true]) {
      expect(cellInputOf(touch, isGenericDisplayPanel('monitor', undefined, true))).toBe(true);
    }
  });

  it('keeps the digitizer answer of a known display (iCUE LINK 5" LCD, Xeneon Edge)', () => {
    const lcd5 = isGenericDisplayPanel('monitor', 'icue-link-lcd5', true);
    const xeneon = isGenericDisplayPanel('monitor', 'xeneon-edge', true);
    expect(cellInputOf(false, lcd5)).toBe(false);
    expect(surfaceInputMode('monitor', cellInputOf(false, lcd5))).toBe('none');
    expect(cellInputOf(true, xeneon)).toBe(true);
    expect(surfaceInputMode('monitor', cellInputOf(true, xeneon))).toBe('touch');
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

  it('keeps the Lian Li 8.8 coarse size when stored, and adds a doubled-columns 50% beside the default', () => {
    expect(panelShortSideSlots('monitor', 'lianli-screen88', 'large')).toBe(2);
    expect(panelShortSideSlots('monitor', 'lianli-screen88', 'small')).toBeUndefined();
    expect(panelShortSideSlots('monitor', 'lianli-screen88', null)).toBeUndefined();
    expect(panelLayoutSurface('monitor', 'lianli-screen88', 'large')).toBe('monitor');
    expect(panelShortSideSlots('monitor', 'hyte-y60', 'large')).toBe(2);
    expect(panelShortSideSlots('monitor', 'hyte-y60', 'small')).toBeUndefined();
    expect(panelWidgetSizeOptions('monitor', 'hyte-y60')).toMatchObject({ default: 'small', layoutSurface: { large: 'monitor', small: 'monitor', xsmall: 'monitor' } });
    expect(panelShortSideSlots('monitor', 'hyte-y60', 'xsmall', 4)).toBe(8);
    expect(panelShortSideSlots('monitor', 'lianli-screen88', 'xsmall', 6)).toBe(12);
    expect(panelShortSideSlots('monitor', 'icue-link-lcd5', 'large')).toBeUndefined();
    expect(panelShortSideSlots('q60', undefined, 'large')).toBeUndefined();
  });

  it('starts a plain monitor on its density grid, and a stored Large is its original half-count 200%', () => {
    expect(resolvePanelWidgetSize('monitor', undefined, null)).toBe('small');
    expect(resolvePanelWidgetSize('monitor', null, 'small')).toBe('small');
    expect(resolvePanelWidgetSize('monitor', null, 'large')).toBe('large');
    expect(panelShortSideSlots('monitor', undefined, null, 12)).toBeUndefined();
    expect(panelShortSideSlots('monitor', undefined, 'large', 12)).toBe(6);
    expect(panelShortSideSlots('monitor', undefined, 'large', 8)).toBe(4);
    expect(panelShortSideSlots('monitor', undefined, 'large', 4)).toBe(2);
    expect(panelLayoutSurface('monitor', undefined, 'large')).toBe('monitor');
    expect(panelLayoutDpi('monitor', undefined, 'large', null, { monitor: 110 } as Record<PanelSurface, number>)).toBeUndefined();
  });

  it('is not offered elsewhere, whatever a record carries', () => {
    expect(panelWidgetSizeOptions('monitor', 'xeneon-edge')).toBeUndefined();
    expect(resolvePanelWidgetSize('phone', undefined, 'large')).toBeUndefined();
  });
});

describe('Widget size on the Y70', () => {
  it('keeps the fixed Y70 grid by default and for a stored Large', () => {
    expect(resolvePanelWidgetSize('y70', undefined, undefined)).toBe('large');
    expect(panelLayoutSurface('y70', undefined, undefined)).toBe('y70');
    expect(panelLayoutSurface('y70', undefined, 'large')).toBe('y70');
    expect(panelShortSideSlots('y70', undefined, undefined, 4)).toBeUndefined();
    expect(panelShortSideSlots('y70', undefined, 'large', 4)).toBeUndefined();
    expect(panelLayoutDpi('y70', undefined, undefined, null, { y70: 337 } as Record<PanelSurface, number>)).toBeUndefined();
  });

  it('forces 6 and 8 columns on the y70 surface at 6 and 8 columns', () => {
    expect(panelLayoutSurface('y70', undefined, 'small')).toBe('y70');
    expect(panelLayoutSurface('y70', undefined, 'xsmall')).toBe('y70');
    expect(panelShortSideSlots('y70', undefined, 'small', 4)).toBe(6);
    expect(panelShortSideSlots('y70', undefined, 'xsmall', 4)).toBe(8);
    expect(panelShortSideSlots('y70', undefined, 'xsmall')).toBe(8);
    expect(panelLayoutDpi('y70', undefined, 'xsmall', null, { y70: 337 } as Record<PanelSurface, number>)).toBeUndefined();
  });
});

describe('Y70 at 6 and 8 columns', () => {
  const sizes = [undefined, 'large', 'small', 'xsmall'] as const;

  it('resolves every surface-keyed choice exactly as at 4 columns', () => {
    for (const size of sizes) {
      // Backdrop, theme, touch and catalog all key on the layout surface and the glass; neither moves.
      expect(panelLayoutSurface('y70', undefined, size)).toBe('y70');
      expect(panelLayoutDpi('y70', undefined, size, null, { y70: 337 } as Record<PanelSurface, number>)).toBeUndefined();
      expect(surfaceSupportsTouch(panelLayoutSurface('y70', undefined, size), true)).toBe(surfaceSupportsTouch('y70', true));
      expect(isGenericDisplayPanel('y70', undefined, true)).toBe(false);
    }
  });

  it('changes only the column count, with square cells and rows from the height', () => {
    const at = (cols: number | undefined) => panelGridCapacityForCanvas(682, 2560, { surface: 'y70', dpi: 337, paddingRatio: 0.1, shortSideSlots: cols });
    expect(at(undefined)).toMatchObject({ columns: 4, rows: 16 });
    for (const cols of [6, 8]) {
      const cap = at(cols);
      expect(cap.columns).toBe(cols);
      expect(cap.rows).toBeGreaterThan(16);
      expect(Math.abs(cap.rowSize - cap.cellSize)).toBeLessThan(cap.cellSize * 0.1);
    }
  });
});

describe('Y70 default column count', () => {
  it('is 4 on the 682x2560 glass at its density, which Large keeps', () => {
    const cap = panelGridCapacityForCanvas(682, 2560, { surface: 'y70', dpi: 337, paddingRatio: 0.1 });
    expect(cap.columns).toBe(4);
    expect(cap.rows).toBe(16);
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

describe('hostedDisplayKeyboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the one rule behind free text, the catalog search and the editor', () => {
    vi.stubGlobal('window', { chrome: { webview: { postMessage: () => {} } } });
    expect(hostedDisplayKeyboard('monitor')).toBe(true);
    expect(surfaceSupportsTextInput('monitor')).toBe(true);
    for (const s of ['y70', 'q60', 'lcd-round', 'lcd-square', 'lcd-wide'] as PanelSurface[]) {
      expect(hostedDisplayKeyboard(s)).toBe(false);
      expect(surfaceSupportsTextInput(s)).toBe(false);
    }
  });

  it('is off without a kiosk host', () => {
    vi.stubGlobal('window', {});
    expect(hostedDisplayKeyboard('monitor')).toBe(false);
    expect(surfaceSupportsTextInput('monitor')).toBe(false);
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

  it('gives a mouse-only generic display one page, a touch one its pages, and a known display its pages', () => {
    expect(surfaceAllowsPages('monitor', true, true, true)).toBe(true);
    expect(surfaceAllowsPages('monitor', false, true, true)).toBe(false);
    expect(surfaceAllowsPages('monitor', undefined, true, true)).toBe(false);
    expect(surfaceAllowsPages('monitor', false, true, false)).toBe(true);
    expect(surfaceAllowsPages('monitor', true, true, false)).toBe(true);
    expect(surfaceAllowsPages('y70', undefined, false, false)).toBe(true);
    expect(surfaceAllowsPages('phone', undefined, false, false)).toBe(true);
  });
});

describe('genericSinglePage', () => {
  it('holds only a mouse-only generic display to its first page', () => {
    expect(genericSinglePage(true, 'monitor', true)).toBe(false);
    expect(genericSinglePage(true, 'monitor', false)).toBe(true);
    expect(genericSinglePage(true, 'monitor', undefined)).toBe(true);
    expect(genericSinglePage(false, 'monitor', false)).toBe(false);
  });
});

// Every non-touch-generic panel must keep its pre-change answer; only a generic display with touch:true changes.
describe('generic display touch rule across panel kinds', () => {
  const legacyAllowsPages = (surface: PanelSurface, touch: boolean | undefined, displayBound: boolean, generic: boolean) =>
    !generic && (surfaceSupportsTouch(surface, touch) || (displayBound && !isSingleWidgetSurface(surface)));
  type Kind = { name: string; surface: PanelSurface; family?: string; displayBound: boolean; touch: boolean | undefined; changes?: true };
  const kinds: Kind[] = [
    { name: 'Y70', surface: 'y70', family: 'y70', displayBound: false, touch: true },
    { name: 'Y70 bound to a display', surface: 'y70', family: 'y70', displayBound: true, touch: true },
    { name: 'Q60', surface: 'q60', family: 'q60', displayBound: false, touch: true },
    { name: 'Q80', surface: 'q60', family: 'q80', displayBound: false, touch: false },
    { name: 'Universal Screen', surface: 'monitor', family: LIANLI_SCREEN88_FAMILY, displayBound: true, touch: true },
    { name: 'Universal Screen without touch', surface: 'monitor', family: LIANLI_SCREEN88_FAMILY, displayBound: true, touch: false },
    { name: 'Xeneon Edge', surface: 'monitor', family: 'xeneon-edge', displayBound: true, touch: true },
    { name: 'phone', surface: 'phone', displayBound: false, touch: undefined },
    { name: 'browser panel without a device', surface: 'desktop', displayBound: false, touch: undefined },
    { name: 'monitor without a display', surface: 'monitor', displayBound: false, touch: true },
    { name: 'generic display touch false', surface: 'monitor', displayBound: true, touch: false },
    { name: 'generic display touch missing', surface: 'monitor', displayBound: true, touch: undefined },
    { name: 'generic display touch true', surface: 'monitor', displayBound: true, touch: true, changes: true },
  ];

  it.each(kinds)('$name', ({ surface, family, displayBound, touch, changes }) => {
    const generic = isGenericDisplayPanel(surface, family, displayBound);
    const oneBefore = generic;
    const oneNow = genericSinglePage(generic, surface, touch);
    const allowsBefore = legacyAllowsPages(surface, touch, displayBound, generic);
    const allowsNow = surfaceAllowsPages(surface, touch, displayBound, generic);
    // Fold, held pages and tap suppression all key on oneNow; PanelApp's cell tap otherwise needs surfaceSupportsTouch.
    if (changes) {
      expect(generic).toBe(true);
      expect(oneBefore).toBe(true);
      expect(oneNow).toBe(false);
      expect(allowsBefore).toBe(false);
      expect(allowsNow).toBe(true);
    } else {
      expect(oneNow).toBe(oneBefore);
      expect(allowsNow).toBe(allowsBefore);
    }
  });
});

describe('widget size options for a plain display', () => {
  it('offers 200, 150, 100, 75 and 50 percent around the density grid', async () => {
    const { panelWidgetSizeOptions, panelShortSideSlots, panelLayoutSurface, resolvePanelWidgetSize } = await import('./types');
    const options = panelWidgetSizeOptions('monitor', undefined);
    expect(Object.keys(options!.layoutSurface).sort()).toEqual(['large', 'medium', 'midlarge', 'small', 'xsmall']);
    expect(options!.percentLabels).toEqual({ large: 200, midlarge: 150, small: 100, medium: 75, xsmall: 50 });
    // 200% halves and 150% takes two thirds of the count, each to an even number.
    expect(panelShortSideSlots('monitor', undefined, 'large', 12)).toBe(6);
    expect(panelShortSideSlots('monitor', undefined, 'midlarge', 12)).toBe(8);
    expect(panelShortSideSlots('monitor', undefined, 'midlarge', 16)).toBe(10);
    expect(panelShortSideSlots('monitor', undefined, 'midlarge', 24)).toBe(16);
    expect(panelShortSideSlots('monitor', undefined, 'small', 12)).toBeUndefined();
    expect(panelShortSideSlots('monitor', undefined, 'medium', 12)).toBe(18);
    expect(panelShortSideSlots('monitor', undefined, 'medium', 4)).toBe(6);
    expect(panelShortSideSlots('monitor', undefined, 'medium', 8)).toBe(12);
    expect(panelShortSideSlots('monitor', undefined, 'xsmall', 12)).toBe(24);
    expect(panelShortSideSlots('monitor', undefined, 'xsmall', 60)).toBe(64);
    expect(resolvePanelWidgetSize('monitor', undefined, 'medium')).toBe('medium');
    expect(resolvePanelWidgetSize('monitor', undefined, 'xsmall')).toBe('xsmall');
    expect(panelLayoutSurface('monitor', undefined, 'xsmall')).toBe('monitor');
  });

  it('offers no 75 percent on a curated display or a tile panel', async () => {
    const { panelWidgetSizeOptions, resolvePanelWidgetSize } = await import('./types');
    expect(panelWidgetSizeOptions('monitor', 'lianli-screen88')!.layoutSurface.medium).toBeUndefined();
    expect(panelWidgetSizeOptions('q60')!.layoutSurface.medium).toBeUndefined();
    expect(panelWidgetSizeOptions('q60')!.layoutSurface.xsmall).toBeUndefined();
    expect(resolvePanelWidgetSize('q60', undefined, 'xsmall')).toBe('large');
    expect(resolvePanelWidgetSize('q60', undefined, 'medium')).toBe('large');
  });

  it('maps a retired grid density to the nearest size', async () => {
    const { sizeForLegacyGridSlots } = await import('./types');
    expect(sizeForLegacyGridSlots(6, 12)).toBe('large');
    expect(sizeForLegacyGridSlots(12, 12)).toBe('small');
    expect(sizeForLegacyGridSlots(10, 12)).toBe('small');
    expect(sizeForLegacyGridSlots(18, 12)).toBe('medium');
    expect(sizeForLegacyGridSlots(8, 12)).toBe('midlarge');
    expect(sizeForLegacyGridSlots(26, 12)).toBe('xsmall');
    expect(sizeForLegacyGridSlots(0, 12)).toBeUndefined();
    expect(sizeForLegacyGridSlots(12, undefined)).toBeUndefined();
  });
});

describe('largeChromeGrid', () => {
  const dpis = { y70: 337, monitor: 110, q60: 220 } as Record<PanelSurface, number>;

  it('keeps chrome on the Large grid whatever size is stored', () => {
    expect(largeChromeGrid('y70', undefined, null, dpis, 4)).toEqual({ surface: 'y70', shortSideSlots: undefined, dpi: undefined });
    // A plain display has no Large, so its 100% is the reference.
    expect(largeChromeGrid('monitor', undefined, null, dpis, 8)).toEqual({ surface: 'monitor', shortSideSlots: undefined, dpi: undefined });
    // iCUE defaults to its grid, so chrome sizes from that, not from the one-tile Large.
    expect(largeChromeGrid('monitor', 'icue-link-lcd5', null, dpis, 4)).toEqual({ surface: 'monitor', shortSideSlots: undefined, dpi: undefined });
    expect(largeChromeGrid('q60', undefined, null, dpis, 4)).toEqual({ surface: 'q60', shortSideSlots: undefined, dpi: undefined });
    // Lian Li 8.8 and Y60 default to the density grid, not the coarse stored Large.
    expect(largeChromeGrid('monitor', 'lianli-screen88', null, dpis, 4)).toEqual({ surface: 'monitor', shortSideSlots: undefined, dpi: undefined });
  });

  it('is absent where no size choice exists, so chrome follows the grid in use', () => {
    expect(largeChromeGrid('phone', undefined, null, dpis)).toBeUndefined();
    expect(largeChromeGrid('monitor', 'xeneon-edge', null, dpis)).toBeUndefined();
  });
});

describe('stored widget size per device', () => {
  const resolved = (surface: PanelSurface, family: string | undefined, stored: string | undefined) => {
    const mode = resolvePanelWidgetSize(surface, family, stored);
    return `${mode}/${panelLayoutSurface(surface, family, stored)}/${panelShortSideSlots(surface, family, stored, 4) ?? '-'}`;
  };

  it('leaves every existing stored value where it was, including the plain-display Large at its original 200%', () => {
    // Plain display: unset and small are 100%, xsmall stays 50%, large is its original half-count 200%.
    expect(['small', undefined, 'large', 'xsmall', 'medium', 'midlarge'].map(v => resolved('monitor', undefined, v))).toEqual([
      'small/monitor/-', 'small/monitor/-', 'large/monitor/2', 'xsmall/monitor/8', 'medium/monitor/6', 'midlarge/monitor/2',
    ]);
    // Y70: unset and large are the fixed grid; small and xsmall keep 6 and 8 columns.
    expect(['large', undefined, 'small', 'xsmall'].map(v => resolved('y70', undefined, v))).toEqual([
      'large/y70/-', 'large/y70/-', 'small/y70/6', 'xsmall/y70/8',
    ]);
    // Tile devices: large is the tile (100%), small the grid (50%); xsmall is not offered.
    for (const [surface, family] of [['q60', undefined], ['lcd-square', 'asus-glacial-lcd'], ['lcd-wide', 'lianli-hydroshift2-curve']] as const) {
      expect([undefined, 'large', 'small', 'xsmall'].map(v => resolvePanelWidgetSize(surface, family, v))).toEqual(['large', 'large', 'small', 'large']);
    }
    // Grid devices: unset and small are 100%, the stored coarse large is still honoured, xsmall is the new 50% (iCUE keeps its tile Large).
    for (const family of ['lianli-screen88', 'hyte-y60', 'icue-link-lcd5']) {
      expect([undefined, 'small', 'large', 'xsmall'].map(v => resolvePanelWidgetSize('monitor', family, v))).toEqual(['small', 'small', 'large', 'xsmall']);
    }
  });
});
