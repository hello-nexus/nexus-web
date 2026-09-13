import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NollieDevicePage } from './NollieDevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetBoards = vi.fn();
const mockSetStandalone = vi.fn();

vi.mock('../../../api/nollie', () => ({
  getNollieBoards: (...args: any[]) => mockGetBoards(...args),
  setNollieStandalone: (...args: any[]) => mockSetStandalone(...args),
}));

// The picker's own interaction is covered by its tests; here it is a button
// that commits one colour.
vi.mock('../../common/HsvPicker/HsvPicker', () => ({
  HsvPicker: ({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) => (
    <button type="button" data-testid="picker" data-value={value} onClick={() => onCommit('#abcdef')} />
  ),
}));

const original = {
  id: 'nollie-s-AAA',
  name: 'Nollie 32CH',
  serial: 'AAA',
  channels: 32,
  ports: 22,
  supportsStandalone: true,
  supportsBuiltInEffect: true,
  standaloneMode: 'static' as const,
  standaloneColor: '#112233',
};

const os2 = {
  id: 'nollie-s-BBB',
  name: 'Nollie 8_OS2_1',
  serial: 'BBB',
  channels: 8,
  ports: 8,
  supportsStandalone: false,
  supportsBuiltInEffect: false,
  standaloneMode: 'static' as const,
  standaloneColor: '#000000',
};

beforeEach(() => {
  mockGetBoards.mockResolvedValue([original, os2]);
  mockSetStandalone.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NollieDevicePage', () => {
  it('lists one section per board with its channel count', async () => {
    await act(async () => { render(<NollieDevicePage />); });

    expect(screen.getByText('Nollie 32CH')).toBeInTheDocument();
    expect(screen.getByText('Nollie 8_OS2_1')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('offers standalone lighting only where the firmware takes it', async () => {
    await act(async () => { render(<NollieDevicePage />); });

    // One mode select (the original board), one "no standalone" note (the OS2 board).
    expect(screen.getAllByRole('button', { name: 'devices.nollie.standaloneMode' })).toHaveLength(1);
    expect(screen.getByText('devices.nollie.noStandalone')).toBeInTheDocument();
    expect(screen.getByText('devices.nollie.standaloneColor')).toBeInTheDocument();
  });

  it('commits a mode change and hides the colour once the built-in effect is chosen', async () => {
    await act(async () => { render(<NollieDevicePage />); });

    fireEvent.click(screen.getByRole('button', { name: 'devices.nollie.standaloneMode' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.nollie.modeBuiltIn' }));
    });

    expect(mockSetStandalone).toHaveBeenCalledWith('nollie-s-AAA', { mode: 'builtin' });
    expect(screen.queryByText('devices.nollie.standaloneColor')).not.toBeInTheDocument();
  });

  it('commits a picked colour for the board it belongs to', async () => {
    await act(async () => { render(<NollieDevicePage />); });

    const picker = screen.getByTestId('picker');
    expect(picker).toHaveAttribute('data-value', '#112233');
    await act(async () => { fireEvent.click(picker); });

    expect(mockSetStandalone).toHaveBeenCalledWith('nollie-s-AAA', { color: '#abcdef' });
    expect(screen.getByTestId('picker')).toHaveAttribute('data-value', '#abcdef');
  });

  it('shows the empty state when nothing is attached', async () => {
    mockGetBoards.mockResolvedValue([]);
    await act(async () => { render(<NollieDevicePage />); });
    expect(screen.getByText('devices.nollie.noBoards')).toBeInTheDocument();
  });
});
