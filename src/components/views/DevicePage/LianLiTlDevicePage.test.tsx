import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiTlDevicePage } from './LianLiTlDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockState = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../../api/lianli-tl', () => ({
  getLianLiTlState: (...args: any[]) => mockState(...args),
  getLianLiTlLighting: (...args: any[]) => mockGet(...args),
  setLianLiTlLighting: (...args: any[]) => mockSet(...args),
}));

const lighting = {
  mode: 'rainbow',
  speed: 2,
  direction: 0,
  brightness: 4,
  scope: 'all',
  colors: [],
  modes: [{ key: 'rainbow', label: 'Rainbow' }],
  maxColors: 4,
  argbSync: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockState.mockResolvedValue({ isConnected: true, fans: [] });
  mockGet.mockResolvedValue(lighting);
  mockSet.mockResolvedValue({ success: true });
});

describe('LianLiTlDevicePage motherboard ARGB', () => {
  it('turning it on saves the choice and locks the effect controls', async () => {
    await act(async () => {
      render(<LianLiTlDevicePage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.motherboardArgb.label' }));
    });

    expect(mockSet).toHaveBeenCalledWith({ argbSync: true });
    expect(screen.getByRole('button', { name: 'devices.lianli-tl.lightingMode' })).toBeDisabled();
  });
});
