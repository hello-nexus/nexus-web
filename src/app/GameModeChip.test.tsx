import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GameModeStatus } from '../api/gameMode';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const setState = vi.fn();
let status: GameModeStatus | null = null;

vi.mock('../hooks/useGameMode', () => ({
  useGameMode: () => ({ status, setState, setEffects: vi.fn() }),
}));

import { GameModeChip } from './GameModeChip';

function statusFor(overrides: Partial<GameModeStatus> = {}): GameModeStatus {
  return {
    state: 'auto',
    active: true,
    reason: 'auto',
    activatedUtcMs: Date.now(),
    games: [{ key: 'steam:1', name: 'Hades', pid: 42, sinceMs: Date.now() }],
    effects: {
      holdNotifications: true,
      holdBackgroundNetwork: true,
      turnPanelDisplaysOff: false,
      stopPanelRendering: false,
      exitGraceSeconds: 30,
    },
    ...overrides,
  };
}

describe('GameModeChip', () => {
  beforeEach(() => {
    setState.mockClear();
    status = null;
  });

  it('renders nothing while Game Mode is inactive', () => {
    status = statusFor({ active: false });
    const { container } = render(<GameModeChip online onNavigateSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the first status arrives', () => {
    status = null;
    const { container } = render(<GameModeChip online onNavigateSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the running game name while active', () => {
    status = statusFor();
    render(<GameModeChip online onNavigateSettings={() => {}} />);
    expect(screen.getByText('Hades')).toBeInTheDocument();
  });

  it('falls back to the mode name when it was switched on by hand', () => {
    status = statusFor({ reason: 'manual', state: 'on', games: [] });
    render(<GameModeChip online onNavigateSettings={() => {}} />);
    expect(screen.getByText('gameMode.title')).toBeInTheDocument();
  });

  it('counts the games beyond the newest', () => {
    status = statusFor({
      games: [
        { key: 'steam:1', name: 'Hades', pid: 42, sinceMs: Date.now() },
        { key: 'steam:2', name: 'Factorio', pid: 43, sinceMs: Date.now() },
      ],
    });
    render(<GameModeChip online onNavigateSettings={() => {}} />);
    expect(screen.getByText('Factorio')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('switches the state from the popover', () => {
    status = statusFor();
    render(<GameModeChip online onNavigateSettings={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /gameMode.title/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'gameMode.state.off' }));
    expect(setState).toHaveBeenCalledWith('off');
  });

  it('opens settings from the popover', () => {
    status = statusFor();
    const onNavigateSettings = vi.fn();
    render(<GameModeChip online onNavigateSettings={onNavigateSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /gameMode.title/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /nav.settings/ }));
    expect(onNavigateSettings).toHaveBeenCalled();
  });
});
