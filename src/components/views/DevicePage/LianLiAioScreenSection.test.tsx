import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiAioScreenSection } from './LianLiAioScreenSection';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetLianLiAioScreen = vi.fn();
const mockSetLianLiAioScreen = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiAioScreen: (...args: any[]) => mockGetLianLiAioScreen(...args),
  setLianLiAioScreen: (...args: any[]) => mockSetLianLiAioScreen(...args),
}));

const saved = {
  brightness: 80,
  theme: 0,
  themeCount: 13,
  labelColor: '#FFFFFF',
  valueColor: '#FFFFFF',
  unitColor: '#FFFFFF',
  showCpuTemp: true,
  showCpuLoad: true,
  showGpuTemp: true,
  showGpuLoad: true,
  showFanSpeed: false,
  loopInterval: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLianLiAioScreen.mockResolvedValue(saved);
  mockSetLianLiAioScreen.mockResolvedValue(true);
});

async function renderSection() {
  await act(async () => {
    render(<LianLiAioScreenSection mac="AABBCCDDEEFF" />);
  });
}

describe('LianLiAioScreenSection', () => {
  it('loads the AIO\'s screen and offers one entry per theme', async () => {
    await renderSection();
    expect(mockGetLianLiAioScreen).toHaveBeenCalledWith('AABBCCDDEEFF');
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.theme' }));
    expect(screen.getAllByRole('option')).toHaveLength(13);
  });

  it('saves a theme and a reading toggle as they change', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.theme' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.aioScreen.themeN:{"n":3}' }));
    });
    expect(mockSetLianLiAioScreen).toHaveBeenCalledWith('AABBCCDDEEFF', { theme: 2 });

    const fanSpeed = screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.fanSpeed' });
    expect(fanSpeed).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(fanSpeed);
    });
    expect(mockSetLianLiAioScreen).toHaveBeenCalledWith('AABBCCDDEEFF', { showFanSpeed: true });
    expect(fanSpeed).toHaveAttribute('aria-checked', 'true');
  });

  it('reloads the saved screen when the service refuses a change', async () => {
    mockSetLianLiAioScreen.mockResolvedValue(false);
    await renderSection();
    const cpuTemp = screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.cpuTemp' });
    await act(async () => {
      fireEvent.click(cpuTemp);
    });
    expect(mockGetLianLiAioScreen).toHaveBeenCalledTimes(2);
    expect(cpuTemp).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps the section when the reload after a refused change fails too', async () => {
    mockSetLianLiAioScreen.mockResolvedValue(false);
    await renderSection();
    mockGetLianLiAioScreen.mockResolvedValue(null);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.gpuLoad' }));
    });
    expect(screen.getByText('devices.lianli-wireless.aioScreen.title')).toBeInTheDocument();
  });

  it('picking one reading shows only it and hides the cycle list', async () => {
    await renderSection();
    expect(screen.getByText('devices.lianli-wireless.aioScreen.interval')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.shows' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.aioScreen.gpuTemp' }));
    });
    expect(mockSetLianLiAioScreen).toHaveBeenCalledWith('AABBCCDDEEFF', {
      showCpuTemp: false, showCpuLoad: false, showGpuTemp: true, showGpuLoad: false, showFanSpeed: false,
    });
    expect(screen.queryByRole('switch', { name: 'devices.lianli-wireless.aioScreen.cpuTemp' })).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.aioScreen.interval')).not.toBeInTheDocument();
  });

  it('a single saved reading shows in the dropdown, and Cycle turns every reading on', async () => {
    mockGetLianLiAioScreen.mockResolvedValue({ ...saved, showCpuLoad: false, showGpuTemp: false, showGpuLoad: false });
    await renderSection();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.shows' }))
      .toHaveTextContent('devices.lianli-wireless.aioScreen.cpuTemp');
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.shows' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.aioScreen.cycle' }));
    });
    expect(mockSetLianLiAioScreen).toHaveBeenCalledWith('AABBCCDDEEFF', {
      showCpuTemp: true, showCpuLoad: true, showGpuTemp: true, showGpuLoad: true, showFanSpeed: true,
    });
  });

  it('cycling keeps at least two readings on', async () => {
    mockGetLianLiAioScreen.mockResolvedValue({ ...saved, showCpuLoad: false, showGpuLoad: false });
    await renderSection();
    expect(screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.cpuTemp' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.gpuTemp' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.cpuLoad' })).not.toBeDisabled();
  });

  it('reloads every reading when the service refuses a Shows change', async () => {
    mockSetLianLiAioScreen.mockResolvedValue(false);
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.shows' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.aioScreen.gpuTemp' }));
    });
    expect(mockGetLianLiAioScreen).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('switch', { name: 'devices.lianli-wireless.aioScreen.cpuTemp' })).toHaveAttribute('aria-checked', 'true');
  });

  it('renders nothing for an AIO the service does not know', async () => {
    mockGetLianLiAioScreen.mockResolvedValue(null);
    await renderSection();
    expect(screen.queryByText('devices.lianli-wireless.aioScreen.title')).not.toBeInTheDocument();
  });
});
