import { describe, expect, it } from 'vitest';
import { resolvePanelNativeCanvas } from './panelNativeCanvas';

describe('resolvePanelNativeCanvas', () => {
  it('returns the preset canvas untouched for simulated panels (native px, dpr 1)', () => {
    const result = resolvePanelNativeCanvas({
      surface: 'y70',
      previewSize: { width: 682, height: 2560 },
    });
    expect(result).toEqual({ cssWidth: 682, cssHeight: 2560, nativeWidth: 682, nativeHeight: 2560 });
  });

  it('multiplies a live CSS canvas by the live dpr', () => {
    const result = resolvePanelNativeCanvas({
      surface: 'y70',
      liveCanvas: { width: 734, height: 2560 },
      liveDpr: 1.5,
      previewSize: { width: 682, height: 2560 },
    });
    expect(result).toEqual({ cssWidth: 734, cssHeight: 2560, nativeWidth: 1101, nativeHeight: 3840 });
  });

  it('multiplies a record previewSize by previewDpr when no live canvas exists', () => {
    const result = resolvePanelNativeCanvas({
      surface: 'monitor',
      previewSize: { width: 2560, height: 720 },
      previewDpr: 1.25,
    });
    expect(result).toEqual({ cssWidth: 2560, cssHeight: 720, nativeWidth: 3200, nativeHeight: 900 });
  });

  it('keeps a landscape live canvas landscape', () => {
    const result = resolvePanelNativeCanvas({
      surface: 'monitor',
      liveCanvas: { width: 2560, height: 720 },
      liveDpr: 1,
    });
    expect(result).toEqual({ cssWidth: 2560, cssHeight: 720, nativeWidth: 2560, nativeHeight: 720 });
  });

  it('pins q60 to the fixed 720x1280 hardware resolution', () => {
    const live = resolvePanelNativeCanvas({
      surface: 'q60',
      liveCanvas: { width: 720, height: 1280 },
      liveDpr: 1.5,
    });
    expect(live.nativeWidth).toBe(720);
    expect(live.nativeHeight).toBe(1280);

    const simulated = resolvePanelNativeCanvas({
      surface: 'q60',
      previewSize: { width: 720, height: 1280 },
    });
    expect(simulated.nativeWidth).toBe(720);
    expect(simulated.nativeHeight).toBe(1280);
  });

  it('falls back to the y70 portrait profile without canvas facts', () => {
    const result = resolvePanelNativeCanvas({ surface: 'y70' });
    expect(result).toEqual({ cssWidth: 682, cssHeight: 2560, nativeWidth: 682, nativeHeight: 2560 });
  });

  it('treats a zero dpr as 1', () => {
    const result = resolvePanelNativeCanvas({
      surface: 'monitor',
      liveCanvas: { width: 1920, height: 515 },
      liveDpr: 0,
    });
    expect(result.nativeWidth).toBe(1920);
    expect(result.nativeHeight).toBe(515);
  });
});
