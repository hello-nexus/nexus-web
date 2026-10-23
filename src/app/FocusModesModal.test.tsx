import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusMode, FocusStatus } from '../api/focus';
import type { PresetApp } from '../api/lighting';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key) }),
}));

// The picker needs the service's shortcut list and a live processes topic.
vi.mock('../panel/widgets/common/AppPicker', () => ({
  AppPicker: ({ onSelect }: { onSelect: (app: PresetApp) => void }) => (
    <button
      type="button"
      onClick={() => onSelect({ id: 'proc:chrome', name: 'chrome', processName: 'chrome' })}
    >
      pick-chrome
    </button>
  ),
}));

const updateMode = vi.fn<(id: string, patch: unknown) => Promise<boolean>>();
let status: FocusStatus | null = null;

vi.mock('../hooks/useFocus', () => ({
  useFocus: () => ({
    status, updateMode,
    addMode: vi.fn(), removeMode: vi.fn(), reorder: vi.fn(), resetModes: vi.fn(),
    activate: vi.fn(), turnOff: vi.fn(),
  }),
}));

import { FocusModesModal } from './FocusModesModal';

function mode(overrides: Partial<FocusMode> = {}): FocusMode {
  return {
    id: 'work',
    name: 'Work',
    icon: 'focus',
    builtIn: false,
    trigger: 'app',
    apps: [],
    holdNotifications: false,
    holdBackgroundTraffic: false,
    turnPanelDisplaysOff: false,
    staticPanelBackgrounds: false,
    exitGraceSeconds: 30,
    ...overrides,
  };
}

function setStatus(m: FocusMode, triggers: FocusStatus['availableTriggers']) {
  status = {
    activeModeId: null, reason: '', activatedUtcMs: 0, games: [],
    modes: [m], availableTriggers: triggers,
  };
}

function open() {
  render(<FocusModesModal open onClose={() => {}} serviceOnline />);
  fireEvent.click(screen.getByText('Work'));
}

describe('FocusModesModal app trigger', () => {
  beforeEach(() => { updateMode.mockReset(); updateMode.mockResolvedValue(true); });

  it('offers the app trigger only when the service reports it', () => {
    setStatus(mode({ trigger: 'manual' }), ['manual', 'game']);
    open();
    fireEvent.click(screen.getByText('focus.trigger.manual'));
    expect(screen.getByText('focus.trigger.game')).toBeTruthy();
    expect(screen.queryByText('focus.trigger.app')).toBeNull();
  });

  it('offers the app trigger when available', () => {
    setStatus(mode({ trigger: 'manual' }), ['manual', 'game', 'app']);
    open();
    fireEvent.click(screen.getByText('focus.trigger.manual'));
    expect(screen.getByText('focus.trigger.app')).toBeTruthy();
  });

  it('shows the empty hint and no chips without apps', () => {
    setStatus(mode(), ['manual', 'app']);
    open();
    expect(screen.getByText('focus.mode.apps.empty')).toBeTruthy();
  });

  it('hides the apps row for other triggers', () => {
    setStatus(mode({ trigger: 'manual' }), ['manual', 'app']);
    open();
    expect(screen.queryByText('focus.mode.apps.choose')).toBeNull();
  });

  it('patches apps from the picker modal on save', async () => {
    setStatus(mode(), ['manual', 'app']);
    open();
    fireEvent.click(screen.getByText('focus.mode.apps.choose'));
    fireEvent.click(screen.getByText('pick-chrome'));
    const dialog = screen.getByText('focus.mode.apps.title:Work').closest('[role="dialog"]') ?? document.body;
    fireEvent.click(within(dialog as HTMLElement).getByText('focus.mode.apps.save'));
    await Promise.resolve();
    expect(updateMode).toHaveBeenCalledWith('work', {
      apps: [{ id: 'proc:chrome', name: 'chrome', processName: 'chrome' }],
    });
  });

  it('renders chips and removes one with a patch', async () => {
    setStatus(mode({
      apps: [
        { id: 'proc:chrome', name: 'chrome', processName: 'chrome' },
        { id: 'proc:code', name: 'code', processName: 'code' },
      ],
    }), ['manual', 'app']);
    open();
    expect(screen.getByText('chrome')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByLabelText('focus.mode.apps.remove:chrome')); });
    expect(updateMode).toHaveBeenCalledWith('work', {
      apps: [{ id: 'proc:code', name: 'code', processName: 'code' }],
    });
  });

  it('keeps the picker open with a notice when the save does not land', async () => {
    updateMode.mockResolvedValue(false);
    setStatus(mode(), ['manual', 'app']);
    open();
    fireEvent.click(screen.getByText('focus.mode.apps.choose'));
    fireEvent.click(screen.getByText('pick-chrome'));
    await act(async () => { fireEvent.click(screen.getByText('focus.mode.apps.save')); });
    expect(screen.getByText('focus.mode.apps.title:Work')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('focus.mode.apps.saveFailed');
  });

  it('builds a second rapid removal on the first, ending with both apps gone', async () => {
    const resolvers: Array<(ok: boolean) => void> = [];
    updateMode.mockImplementation(() => new Promise<boolean>(r => { resolvers.push(r); }));
    setStatus(mode({
      apps: [
        { id: 'proc:chrome', name: 'chrome', processName: 'chrome' },
        { id: 'proc:code', name: 'code', processName: 'code' },
      ],
    }), ['manual', 'app']);
    open();
    await act(async () => { fireEvent.click(screen.getByLabelText('focus.mode.apps.remove:chrome')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('focus.mode.apps.remove:code')); });
    await act(async () => { resolvers[0](true); });
    await act(async () => { resolvers[1](true); });
    expect(updateMode).toHaveBeenNthCalledWith(1, 'work', {
      apps: [{ id: 'proc:code', name: 'code', processName: 'code' }],
    });
    expect(updateMode).toHaveBeenNthCalledWith(2, 'work', { apps: [] });
  });

  it('surfaces a failed chip removal', async () => {
    updateMode.mockResolvedValue(false);
    setStatus(mode({ apps: [{ id: 'proc:chrome', name: 'chrome', processName: 'chrome' }] }), ['manual', 'app']);
    open();
    await act(async () => { fireEvent.click(screen.getByLabelText('focus.mode.apps.remove:chrome')); });
    expect(screen.getByRole('alert').textContent).toBe('focus.mode.apps.saveFailed');
  });
});
