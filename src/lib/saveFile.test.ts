import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlobToFile } from './saveFile';

type PickerWindow = Window & { showSaveFilePicker?: unknown };

const blob = new Blob(['x'], { type: 'image/png' });

function stubObjectUrl() {
  const create = vi.fn(() => 'blob:test');
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: create, revokeObjectURL: revoke }));
  return { create, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as PickerWindow).showSaveFilePicker;
  vi.restoreAllMocks();
});

describe('saveBlobToFile', () => {
  it('writes through the save picker when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const picker = vi.fn().mockResolvedValue({
      createWritable: () => Promise.resolve({ write, close }),
    });
    (window as PickerWindow).showSaveFilePicker = picker;

    const saved = await saveBlobToFile(blob, 'panel.png');

    expect(saved).toBe(true);
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'panel.png', types: undefined });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
  });

  it('returns false without downloading when the user cancels the picker', async () => {
    (window as PickerWindow).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const { create } = stubObjectUrl();

    const saved = await saveBlobToFile(blob, 'panel.png');

    expect(saved).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('falls back to an anchor download when the picker fails', async () => {
    vi.useFakeTimers();
    (window as PickerWindow).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('nope', 'SecurityError'));
    const { create, revoke } = stubObjectUrl();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const saved = await saveBlobToFile(blob, 'panel.png');

    expect(saved).toBe(true);
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
  });

  it('downloads via anchor when no picker exists', async () => {
    const { create } = stubObjectUrl();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const saved = await saveBlobToFile(blob, 'panel.png');

    expect(saved).toBe(true);
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
  });
});
