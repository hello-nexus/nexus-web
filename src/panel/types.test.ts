// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isStreamedPanelSurface, panelLayoutDpi, panelLayoutSurface, panelShortSideSlots, panelWidgetSizeOptions, resolvePanelWidgetSize, surfaceAllowsPages,
  surfaceInputMode, widgetDisplayShape, type PanelSurface,
} from './types';

describe('surfaceInputMode', () => {
  it('maps every surface to its input method', () => {
    const cases: Array<[PanelSurface, boolean | undefined, ReturnType<typeof surfaceInputMode>]> = [
      ['desktop', undefined, 'pointer'],
      ['y70', undefined, 'touch'],
      ['phone', undefined, 'touch'],
      ['q60', undefined, 'none'],
      ['kraken', undefined, 'none'],
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
    for (const surface of ['kraken', 'lcd-round', 'lcd-square', 'lcd-wide', 'q60'] as const) {
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
});
