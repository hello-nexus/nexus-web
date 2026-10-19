import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCREEN_SOURCE, LianLiScreenSourcePicker } from './LianLiScreenSourcePicker';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockMonitors = vi.fn();
vi.mock('../../../api/lighting', () => ({
  fetchScreenMonitors: (...a: any[]) => mockMonitors(...a),
}));

vi.mock('../../common/ScreenPreviewCanvas/ScreenPreviewCanvas', () => ({
  ScreenPreviewCanvas: ({ onSize, onUnavailable }: { onSize?: (w: number, h: number) => void; onUnavailable?: () => void }) => (
    <div data-testid="preview">
      <button type="button" onClick={() => onSize?.(320, 200)}>frame</button>
      <button type="button" onClick={() => onUnavailable?.()}>gone</button>
    </div>
  ),
}));

const twoMonitors = {
  effects: [], selectionMode: 'app', selectedMonitor: '0',
  monitors: [{ id: '0', name: 'Main' }, { id: '1', name: 'Side' }],
};

async function renderPicker(value = DEFAULT_SCREEN_SOURCE) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  await act(async () => {
    render(<LianLiScreenSourcePicker value={value} label="Region" onPreview={onPreview} onCommit={onCommit} />);
  });
  return { onPreview, onCommit };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMonitors.mockResolvedValue(twoMonitors);
});

describe('LianLiScreenSourcePicker', () => {
  it('defaults to the largest centered square at full size', async () => {
    await renderPicker();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.screenSourceSize' })).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'devices.lianli-flex.screenSourceResetButton' })).toBeDisabled();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('offers a display select with several displays and saves the pick with the region kept', async () => {
    const { onCommit } = await renderPicker({ displayId: '', cropX: 0.1, cropY: 0.2, cropSize: 0.5 });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.screenSourceDisplay' }));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'Side' })); });
    expect(onCommit).toHaveBeenCalledWith({ displayId: '1', cropX: 0.1, cropY: 0.2, cropSize: 0.5 });
  });

  it('has no display select for one display or when the OS picks the display', async () => {
    mockMonitors.mockResolvedValue({ ...twoMonitors, monitors: [twoMonitors.monitors[0]] });
    await renderPicker();
    expect(screen.queryByText('devices.lianli-flex.screenSourceDisplay')).not.toBeInTheDocument();
    document.body.innerHTML = '';
    mockMonitors.mockResolvedValue({ ...twoMonitors, selectionMode: 'system' });
    await renderPicker();
    expect(screen.queryByText('devices.lianli-flex.screenSourceDisplay')).not.toBeInTheDocument();
  });

  it('shows a plain frame instead of the preview for a display the Mirror preview does not follow', async () => {
    await renderPicker({ displayId: '1', cropX: 0, cropY: 0, cropSize: 0 });
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.screenSourceNoPreview')).toBeInTheDocument();
  });

  it('falls back to the plain frame when the service has no preview', async () => {
    await renderPicker();
    await act(async () => { fireEvent.click(screen.getByText('gone')); });
    expect(screen.getByText('devices.lianli-flex.screenSourceNoPreview')).toBeInTheDocument();
  });

  it('moves the region with the keyboard and saves it', async () => {
    const { onCommit } = await renderPicker({ displayId: '', cropX: 0.2, cropY: 0.1, cropSize: 0.5 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Region' }), { key: 'ArrowRight' });
    const saved = onCommit.mock.calls[0][0];
    expect(saved.cropX).toBeCloseTo(0.21);
    expect(saved.displayId).toBe('');
  });

  it('resizes from the slider around the same center and resets to the centered square', async () => {
    const { onCommit } = await renderPicker({ displayId: '', cropX: 0.2, cropY: 0.1, cropSize: 0.5 });
    const slider = screen.getByRole('slider', { name: 'devices.lianli-flex.screenSourceSize' });
    expect(slider).toHaveValue('50');
    fireEvent.change(slider, { target: { value: '30' } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.screenSourceResetButton' }));
    expect(onCommit).toHaveBeenLastCalledWith({ displayId: '', cropX: 0, cropY: 0, cropSize: 0 });
  });

  it('uses the preview frame shape for the region', async () => {
    await renderPicker();
    await act(async () => { fireEvent.click(screen.getByText('frame')); });
    const handle = screen.getByRole('slider', { name: 'Region' });
    expect(parseFloat(handle.style.width)).toBeCloseTo(62.5);
  });
});
