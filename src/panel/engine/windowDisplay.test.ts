// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { displayIdForWindow, type WindowRect } from './windowDisplay';

const disp = (id: string, x: number, y: number, w: number, h: number, pw = w, ph = h, isPrimary = false) =>
  ({ id, bounds: { x, y, width: w, height: h }, resolution: { width: pw, height: ph }, isPrimary });
const win = (screenX: number, screenY: number, outerWidth: number, outerHeight: number, devicePixelRatio: number): WindowRect =>
  ({ screenX, screenY, outerWidth, outerHeight, devicePixelRatio });

describe('displayIdForWindow', () => {
  const winPair = [disp('main', 0, 0, 1920, 1080, 1920, 1080, true), disp('right', 1920, 0, 2560, 1440)];

  it('matches a Windows window on the second display at scale 1', () => {
    expect(displayIdForWindow(winPair, win(2100, 100, 1000, 700, 1))).toBe('right');
  });

  it('scales the CSS center to physical pixels at 1.5 on Windows', () => {
    const pair = [disp('main', 0, 0, 2880, 1620, 2880, 1620, true), disp('right', 2880, 0, 2560, 1440)];
    // Center in CSS px is 1500, which is 2250 physical: still the main display.
    expect(displayIdForWindow(pair, win(1000, 100, 1000, 700, 1.5))).toBe('main');
    // Center 2200 CSS is 3300 physical: the right display.
    expect(displayIdForWindow(pair, win(1700, 100, 1000, 700, 1.5))).toBe('right');
  });

  it('keeps macOS point bounds unscaled and handles a display above the main one', () => {
    const mac = [disp('main', 0, 0, 1512, 982, 3024, 1964, true), disp('top', -200, -1080, 1920, 1080, 3840, 2160)];
    expect(displayIdForWindow(mac, win(100, -900, 800, 600, 2))).toBe('top');
    expect(displayIdForWindow(mac, win(100, 100, 800, 600, 2))).toBe('main');
  });

  it('falls back to the primary display when nothing matches or bounds are missing', () => {
    expect(displayIdForWindow(winPair, win(9000, 9000, 100, 100, 1))).toBe('main');
    const noBounds = [{ id: 'a', bounds: null, resolution: { width: 1, height: 1 }, isPrimary: false }, { id: 'b', bounds: null, resolution: { width: 1, height: 1 }, isPrimary: true }];
    expect(displayIdForWindow(noBounds, win(0, 0, 10, 10, 1))).toBe('b');
    expect(displayIdForWindow([], win(0, 0, 10, 10, 1))).toBeNull();
  });
});
