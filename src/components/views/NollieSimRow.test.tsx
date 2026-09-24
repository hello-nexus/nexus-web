import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({ decks: [], refresh: () => {} }),
}));

const mockGetBoards = vi.fn();
const mockGetModels = vi.fn();
const mockSimulate = vi.fn();
const mockClear = vi.fn();
vi.mock('../../api/nollie', async () => {
  const actual = await vi.importActual<typeof import('../../api/nollie')>('../../api/nollie');
  return {
    ...actual,
    getNollieBoards: (...a: unknown[]) => mockGetBoards(...a),
    getNollieDevModels: (...a: unknown[]) => mockGetModels(...a),
    simulateNollie: (...a: unknown[]) => mockSimulate(...a),
    clearSimulatedNollie: (...a: unknown[]) => mockClear(...a),
  };
});

import { NollieSimRow } from './ToolsView';

const models = [
  { id: '3061:4714', name: 'Nollie 32CH', channels: 32 },
  { id: '16D5:2A08', name: 'Nollie 8_OS2_1', channels: 8 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModels.mockResolvedValue(models);
  mockGetBoards.mockResolvedValue([]);
  mockSimulate.mockResolvedValue(true);
  mockClear.mockResolvedValue(true);
});

describe('NollieSimRow', () => {
  it('connects the first model by default', async () => {
    await act(async () => { render(<NollieSimRow />); });
    expect(screen.getByRole('button', { name: 'tools.nollieSim.title' })).toHaveTextContent('Nollie 32CH');

    mockGetBoards.mockResolvedValue([{ id: 'nollie-s-SIM-4714', serial: 'SIM-4714' }]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })); });

    expect(mockSimulate).toHaveBeenCalledWith('3061:4714');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('reads a simulated board as connected and clears it', async () => {
    mockGetBoards.mockResolvedValue([{ id: 'nollie-s-SIM-2A08', serial: 'SIM-2A08' }]);
    await act(async () => { render(<NollieSimRow />); });
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();

    mockGetBoards.mockResolvedValue([]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Disconnect' })); });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('does not read a real board as the simulator', async () => {
    mockGetBoards.mockResolvedValue([{ id: 'nollie-s-AB12', serial: 'AB12' }]);
    await act(async () => { render(<NollieSimRow />); });
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });
});
