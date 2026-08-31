import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { FocusMode, FocusStatus } from '../api/focus';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const activate = vi.fn();
const turnOff = vi.fn();
let status: FocusStatus | null = null;

vi.mock('./FocusModesModal', () => ({
  FocusModesModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="focus-modes-modal" /> : null,
}));

vi.mock('../hooks/useFocus', () => ({
  useFocus: () => ({
    status, activate, turnOff,
    addMode: vi.fn(), updateMode: vi.fn(),
    removeMode: vi.fn(), reorder: vi.fn(), resetModes: vi.fn(),
  }),
}));

import { FocusChip } from './FocusChip';

function mode(overrides: Partial<FocusMode> = {}): FocusMode {
  return {
    id: 'game',
    name: 'Game Mode',
    icon: 'gamepad',
    builtIn: true,
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
    activeModeId: null,
    reason: '',
    activatedUtcMs: 0,
    games: [],
    modes: [mode(), mode({ id: 'streaming', name: 'Streaming', icon: 'broadcast', trigger: 'obs' })],
    availableTriggers: ['manual', 'game', 'obs'],
    ...overrides,
  };
}

describe('FocusChip', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

  beforeEach(() => {
    activate.mockClear();
    turnOff.mockClear();
    status = null;
  });

  it('renders nothing before the first status arrives', () => {
    const { container } = render(<FocusChip online />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays visible while idle so it can switch a mode on', () => {
    status = statusFor();
    render(<FocusChip online />);
    expect(screen.getByRole('button', { name: 'focus.title' })).toBeInTheDocument();
  });

  it('names the active mode on the control', () => {
    status = statusFor({ activeModeId: 'streaming', reason: 'auto' });
    render(<FocusChip online />);
    expect(screen.getByRole('button', { name: 'focus.title: Streaming' })).toBeInTheDocument();
  });

  // jsdom lays nothing out, so the fit test is driven by stubbed geometry: a
  // header wide enough for the label, or too narrow for it.
  function layOutBar({ roomy }: { roomy: boolean }) {
    const width = roomy ? 1600 : 380;
    Element.prototype.getBoundingClientRect = function () {
      if (this.tagName === 'HEADER') return { left: 0, right: width, width, top: 0, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      // The hidden twin and the chip wrapper: a short label beside a chip that
      // starts near the left edge.
      const isMeasure = (this as HTMLElement).getAttribute?.('aria-hidden') === 'true';
      const w = isMeasure ? 90 : 60;
      return { left: 0, right: w, width: w, top: 0, bottom: 28, height: 28, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  }

  it('names the running game beside the icon when the bar has room', () => {
    layOutBar({ roomy: true });
    status = statusFor({
      activeModeId: 'game',
      reason: 'auto',
      games: [{ key: 'steam:2473350', name: 'Huntdown: Overtime', pid: 1, sinceMs: 0 }],
    });
    render(<FocusChip online />, { container: document.body.appendChild(document.createElement('header')) });

    expect(screen.getAllByText('Huntdown: Overtime').length).toBeGreaterThan(1);
  });

  it('keeps only the icon when the bar is too narrow for the name', () => {
    layOutBar({ roomy: false });
    status = statusFor({
      activeModeId: 'game',
      reason: 'auto',
      games: [{ key: 'steam:2473350', name: 'Huntdown: Overtime', pid: 1, sinceMs: 0 }],
    });
    render(<FocusChip online />, { container: document.body.appendChild(document.createElement('header')) });

    // Only the hidden measuring twin carries the text.
    expect(screen.getAllByText('Huntdown: Overtime')).toHaveLength(1);
  });

  it('lists every mode, then Off, then Settings', () => {
    status = statusFor();
    render(<FocusChip online />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));

    const entries = screen.getAllByRole('menuitemradio').map(el => el.textContent);
    expect(entries).toEqual(['Game Mode', 'Streaming', 'focus.off']);
    expect(screen.getByRole('menuitem', { name: /nav.settings/ })).toBeInTheDocument();
  });

  it('activates the mode that was picked', () => {
    status = statusFor();
    render(<FocusChip online />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Streaming' }));
    expect(activate).toHaveBeenCalledWith('streaming');
  });

  it('turns focus off from the Off entry', () => {
    status = statusFor({ activeModeId: 'game', reason: 'auto' });
    render(<FocusChip online />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title: Game Mode' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'focus.off' }));
    expect(turnOff).toHaveBeenCalled();
  });

  it('opens the modes modal from the popover', () => {
    status = statusFor();
    render(<FocusChip online />);
    fireEvent.click(screen.getByRole('button', { name: 'focus.title' }));
    expect(screen.queryByTestId('focus-modes-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /nav.settings/ }));
    expect(screen.getByTestId('focus-modes-modal')).toBeInTheDocument();
  });
});
