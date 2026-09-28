// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isStreamedPanelSurface, surfaceInputMode, widgetDisplayShape, type PanelSurface } from './types';

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
