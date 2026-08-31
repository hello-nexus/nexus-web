import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FocusMode, FocusStatus } from '../api/focus';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const activate = vi.fn();
const turnOff = vi.fn();
let status: FocusStatus | null = null;

vi.mock('../hooks/useFocus', () => ({
  useFocus: () => ({
    status, activate, turnOff,
    setEnabled: vi.fn(), addMode: vi.fn(), updateMode: vi.fn(),
    removeMode: vi.fn(), reorder: vi.fn(),
  }),
}));

import { FocusChip } from './FocusChip';

function mode(overrides: Partial<FocusMode> = {}): FocusMode {
  return {
    id: 'game',
    name: 'Game Mode',
    icon: 'gamepad',
    builtIn: true,
    autoActivate: true,
    trigger: 'game',
    holdNotifications: true,
    holdBackgroundTraffic: true,
    turnPanelDisplaysOff: false,
    exitGraceSeconds: 30,
    ...overrides,
  };
}

function statusFor(overrides: Partial<FocusStatus> = {}): FocusStatus {
  return {
    enabled: true,
    activeModeId: null,
    reason: '',
    activatedUtcMs: 0,
    games: [],
    modes: [mode(), mode({ id: 'streaming', name: 'Streaming Mode', icon: 'broadcast', trigger: 'obs' })],
    availableTriggers: ['manual', 'game', 'obs'],
    ...overrides,
  };
}

describe('FocusChip', () => {
  beforeEach(() => {
    activate.mockClear();
    turnOff.mockClear();
    status = null;
  });

  it('renders nothing before the first status arrives', () => {
    const { container } = render(<FocusChip online onNavigateSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays visible while idle so it can switch a mode on', () => {
    status = statusFor();
    render(<FocusChip online onNavigateSettings={() => {}} />);
    expect(screen.getByRole('button', { name: 'focus.title' })).toBeInTheDocument();
  });

  it('names the active mode on the control', () => {
    status = statusFor({ activeModeId: 'streaming', reason: 'auto' });
    render(<FocusChip online onNavigateSettings={() => {}} />);
    expect(screen.getByRole('button', { name: 'focus.title: Streaming Mode' })).toBeInTheDocument();
  });

  it('lists every mode, then Off, then Settings', () => {
    status = statusFor();
    render(<FocusChip online onNavigateSettings={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));

    const entries = screen.getAllByRole('menuitemradio').map(el => el.textContent);
    expect(entries).toEqual(['Game Mode', 'Streaming Mode', 'focus.off']);
    expect(screen.getByRole('menuitem', { name: /nav.settings/ })).toBeInTheDocument();
  });

  it('activates the mode that was picked', () => {
    status = statusFor();
    render(<FocusChip online onNavigateSettings={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Streaming Mode' }));
    expect(activate).toHaveBeenCalledWith('streaming');
  });

  it('turns focus off from the Off entry', () => {
    status = statusFor({ activeModeId: 'game', reason: 'auto' });
    render(<FocusChip online onNavigateSettings={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title: Game Mode' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'focus.off' }));
    expect(turnOff).toHaveBeenCalled();
  });

  it('opens settings from the popover', () => {
    status = statusFor();
    const onNavigateSettings = vi.fn();
    render(<FocusChip online onNavigateSettings={onNavigateSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /nav.settings/ }));
    expect(onNavigateSettings).toHaveBeenCalled();
  });
});
