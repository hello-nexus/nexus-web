import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrimerDevicePage } from './StrimerDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../../api/strimer', () => ({
  getStrimerLighting: (...args: any[]) => mockGet(...args),
  setStrimerLighting: (...args: any[]) => mockSet(...args),
}));

const lighting = {
  mode: 'rainbow',
  speed: 2,
  direction: 0,
  brightness: 4,
  colors: [],
  modes: [{ key: 'rainbow', label: 'Rainbow', hasSpeed: true, hasDirection: true, hasBrightness: true, colorsMin: 0, colorsMax: 0 }],
  argbSync: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue({ success: true });
});

describe('StrimerDevicePage motherboard ARGB', () => {
  it('turning it on saves the choice and locks the effect controls', async () => {
    mockGet.mockResolvedValue(lighting);
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' }));
    });

    expect(mockSet).toHaveBeenCalledWith({ argbSync: true });
    expect(screen.getByRole('button', { name: 'devices.lianli.lightingMode' })).toBeDisabled();
  });

  it('rolls the switch back when the save is refused', async () => {
    mockGet.mockResolvedValue(lighting);
    mockSet.mockResolvedValue(null);
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' }));
    });

    expect(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the saved choice', async () => {
    mockGet.mockResolvedValue({ ...lighting, argbSync: true });
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    expect(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' })).toHaveAttribute('aria-checked', 'true');
  });
});

const SIX = ['#ff0000', '#ff6900', '#ffd700', '#00ff00', '#0000ff', '#aa00ff'];
const drizzling = {
  key: 'drizzling', label: 'Drizzling', hasSpeed: true, hasDirection: true, hasBrightness: true, colorsMin: 6, colorsMax: 6, defaultColors: SIX,
};
const ripple = { ...drizzling, key: 'ripple', label: 'Ripple', hasDirection: false };

describe('StrimerDevicePage effect options', () => {
  it('shows six fixed color slots, speed and direction for Drizzling', async () => {
    mockGet.mockResolvedValue({ ...lighting, mode: 'drizzling', colors: SIX, modes: [drizzling] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'devices.lianli.removeColor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli.addColor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.lianli.lightingDirection' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'devices.lianli.lightingSpeedAria' })).toBeInTheDocument();
  });

  it('hides direction for an effect without it', async () => {
    mockGet.mockResolvedValue({ ...lighting, mode: 'ripple', colors: SIX, modes: [ripple] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    expect(screen.queryByRole('button', { name: 'devices.lianli.lightingDirection' })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(6);
  });

  it('refetches the palette after the effect changes', async () => {
    mockGet.mockResolvedValue({ ...lighting, mode: 'ripple', colors: SIX, modes: [ripple, drizzling] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });
    mockGet.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.lightingMode' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Drizzling' }));
    });

    expect(mockSet).toHaveBeenCalledWith({ mode: 'drizzling' });
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('StrimerDevicePage per-cable effects', () => {
  const rainbow = { key: 'rainbow', label: 'Rainbow', hasSpeed: true, hasDirection: true, hasBrightness: true, colorsMin: 0, colorsMax: 0, complete: false };
  const own = { target: 'ch1', mode: 'drizzling', speed: 4, direction: 0, brightness: 4, colors: SIX };

  it('offers cables and ports, and saves an edit against the chosen cable', async () => {
    mockGet.mockResolvedValue({ ...lighting, modes: [rainbow, { ...drizzling, complete: true }], gpuZones: 4, looks: [] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.applyTo' }));
    });
    expect(screen.getAllByRole('option')).toHaveLength(1 + 1 + 6 + 1 + 4);
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.strimer.cable8' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.lightingMode' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Drizzling' }));
    });

    expect(mockSet).toHaveBeenCalledWith({ mode: 'drizzling', target: 'ch1' });
  });

  it('shows a cable look of its own with a way back to the shared effect', async () => {
    mockGet.mockResolvedValue({ ...lighting, modes: [rainbow, { ...drizzling, complete: true }], looks: [own] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.applyTo' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.strimer.cable8' }));
    });

    expect(screen.getAllByLabelText('common.hexColor')).toHaveLength(6);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.matchAllPorts' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ target: 'ch1', resetTarget: true });
  });

  it('offers no ports on a cable playing a channel-wide effect', async () => {
    mockGet.mockResolvedValue({ ...lighting, modes: [rainbow, { ...drizzling, complete: true }], looks: [own] });
    await act(async () => {
      render(<StrimerDevicePage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli.applyTo' }));
    });

    expect(screen.getAllByRole('option')).toHaveLength(1 + 1 + 6 + 1);
  });
});
