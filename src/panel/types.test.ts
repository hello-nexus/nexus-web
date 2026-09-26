// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { surfaceInputMode, widgetDisplayShape, type PanelSurface } from './types';

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
