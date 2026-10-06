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
