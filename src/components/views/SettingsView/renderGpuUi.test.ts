import { describe, expect, it } from 'vitest';
import { realCpuName, showRenderGpuPicker, showSoftwareOption } from './renderGpuUi';

describe('renderGpuUi', () => {
  it('shows the picker for a second card or the software option', () => {
    expect(showRenderGpuPicker('windows', 2, false)).toBe(true);
    expect(showRenderGpuPicker('windows', 1, true)).toBe(true);
    expect(showRenderGpuPicker('windows', 1, false)).toBe(false);
    expect(showRenderGpuPicker('macos', 2, true)).toBe(false);
  });

  it('offers the software option only when available or already chosen', () => {
    expect(showSoftwareOption(true, 'auto')).toBe(true);
    expect(showSoftwareOption(false, 'auto')).toBe(false);
    expect(showSoftwareOption(false, 'software')).toBe(true);
  });

  it('returns a real CPU name and rejects empty or placeholder ones', () => {
    expect(realCpuName(' AMD Ryzen 7 9800X3D ')).toBe('AMD Ryzen 7 9800X3D');
    expect(realCpuName('')).toBeNull();
    expect(realCpuName(undefined)).toBeNull();
    expect(realCpuName('CPU')).toBeNull();
    expect(realCpuName('Unknown')).toBeNull();
  });
});
