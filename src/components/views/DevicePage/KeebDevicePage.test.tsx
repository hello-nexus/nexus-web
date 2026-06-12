import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeebDevicePage } from './KeebDevicePage';
import type { KeyboardState } from '../../../api/keeb';

/* eslint-disable @typescript-eslint/no-explicit-any */

const h = vi.hoisted(() => ({
  push: vi.fn(),
  setLayer: vi.fn(),
  setKey: vi.fn(),
  resetLayer: vi.fn(),
  saveFirmwareLighting: vi.fn(),
  savePassiveLighting: vi.fn(),
  saveGameMode: vi.fn(),
  saveRotary: vi.fn(),
  saveRotarySensitivity: vi.fn(),
  loadMacro: vi.fn(),
  saveMacro: vi.fn(),
  state: null as unknown as KeyboardState,
  settings: null,
  layer: 0,
  captured: {
    keyboard: [] as any[],
    assignment: [] as any[],
    rotary: [] as any[],
    settings: [] as any[],
    macro: [] as any[],
  },
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (
      vars && 'n' in vars ? `${key}:${vars.n}` : key
    ),
  }),
}));

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: h.push }),
}));

vi.mock('../../../hooks/useKeeb', () => ({
  useKeeb: () => ({
    state: h.state,
    settings: h.settings,
    loading: false,
    layer: h.layer,
    setLayer: h.setLayer,
    setKey: h.setKey,
    resetLayer: h.resetLayer,
    loadMacro: h.loadMacro,
    saveMacro: h.saveMacro,
    saveFirmwareLighting: h.saveFirmwareLighting,
    savePassiveLighting: h.savePassiveLighting,
    saveGameMode: h.saveGameMode,
    saveRotary: h.saveRotary,
    saveRotarySensitivity: h.saveRotarySensitivity,
  }),
}));

vi.mock('../keeb/KeebKeyboard', () => ({
  KEEB_RENDER_WIDTH: 2030,
  KeebKeyboard: (props: any) => {
    h.captured.keyboard.push(props);
    return (
      <div data-testid="keyboard-stub">
        <button onClick={() => props.onSelect?.({ kind: 'wheel', side: 'left' })}>
          stub-select-wheel
        </button>
        <button onClick={() => props.onSelect?.({ kind: 'key', x: 2, y: 3 })}>
          stub-select-key
        </button>
      </div>
    );
  },
}));

vi.mock('../keeb/KeebSettingsView', () => ({
  KeebSettingsView: (props: any) => {
    h.captured.settings.push(props);
    return <div data-testid="settings-stub" />;
  },
}));

vi.mock('../keeb/KeebKeyAssignmentView', () => ({
  KeebKeyAssignmentView: (props: any) => {
    h.captured.assignment.push(props);
    return <div data-testid="assignment-stub">{JSON.stringify(props.selected)}</div>;
  },
}));

vi.mock('../keeb/KeebRotaryView', () => ({
  KeebRotaryView: (props: any) => {
    h.captured.rotary.push(props);
    return <div data-testid="rotary-stub" data-wheel={props.wheel} />;
  },
}));

vi.mock('../keeb/KeebMacroView', () => ({
  KeebMacroView: (props: any) => {
    h.captured.macro.push(props);
    return <div data-testid="macro-stub" />;
  },
}));

vi.mock('../keeb/KeebTesterView', () => ({
  KeebTesterView: () => <div data-testid="tester-stub" />,
}));

function connectedState(): KeyboardState {
  return { isConnected: true, profile: 0, layout: 'ANSI', layer: 0, keys: [] };
}

const lastKeyboard = () => h.captured.keyboard[h.captured.keyboard.length - 1];
const lastAssignment = () => h.captured.assignment[h.captured.assignment.length - 1];
const lastRotary = () => h.captured.rotary[h.captured.rotary.length - 1];
const lastMacro = () => h.captured.macro[h.captured.macro.length - 1];

function selectWheel() {
  fireEvent.click(screen.getByRole('button', { name: 'stub-select-wheel' }));
}

function selectKey() {
  fireEvent.click(screen.getByRole('button', { name: 'stub-select-key' }));
}

function clickTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

beforeEach(() => {
  h.captured.keyboard.length = 0;
  h.captured.assignment.length = 0;
  h.captured.rotary.length = 0;
  h.captured.settings.length = 0;
  h.captured.macro.length = 0;
  h.push.mockClear();
  h.setLayer.mockClear();
  for (const fn of [
    h.setKey,
    h.resetLayer,
    h.saveFirmwareLighting,
    h.savePassiveLighting,
    h.saveGameMode,
    h.saveRotary,
    h.saveRotarySensitivity,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(true);
  }
  h.loadMacro.mockReset();
  h.loadMacro.mockResolvedValue(null);
  h.saveMacro.mockReset();
  h.saveMacro.mockImplementation(async (index: number, keys: any[]) => ({ index, keys }));
  h.state = connectedState();
  h.settings = null;
  h.layer = 0;
});

describe('KeebDevicePage', () => {
  describe('header and offline copy', () => {
    it('uses keeb.title and no offline copy when connected', () => {
      render(<KeebDevicePage />);
      expect(screen.getByRole('tablist', { name: 'keeb.title' })).toBeInTheDocument();
      expect(lastKeyboard().offlineCopy).toBeUndefined();
    });

    it('uses keeb.titleOffline and passes keeb.offlineCopy when disconnected', () => {
      h.state = { ...connectedState(), isConnected: false };
      render(<KeebDevicePage />);
      expect(screen.getByRole('tablist', { name: 'keeb.titleOffline' })).toBeInTheDocument();
      expect(lastKeyboard().offlineCopy).toBe('keeb.offlineCopy');
    });
  });

  describe('tabs', () => {
    it('renders the four tabs with key-assignment active by default', () => {
      render(<KeebDevicePage />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map(t => t.textContent)).toEqual([
        'keeb.tab.keyAssignment',
        'keeb.tab.macros',
        'keeb.tab.tester',
        'keeb.tab.settings',
      ]);
      expect(screen.getByRole('tab', { name: 'keeb.tab.keyAssignment' }))
        .toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('keyboard-stub')).toBeInTheDocument();
      expect(screen.getByTestId('assignment-stub')).toBeInTheDocument();
    });

    it('settings tab hides the keyboard and shows the settings view', () => {
      render(<KeebDevicePage />);
      clickTab('keeb.tab.settings');
      expect(screen.queryByTestId('keyboard-stub')).not.toBeInTheDocument();
      expect(screen.getByTestId('settings-stub')).toBeInTheDocument();
    });

    it('tester tab keeps the keyboard but non-interactive', () => {
      render(<KeebDevicePage />);
      selectKey();
      clickTab('keeb.tab.tester');
      expect(screen.getByTestId('keyboard-stub')).toBeInTheDocument();
      expect(screen.getByTestId('tester-stub')).toBeInTheDocument();
      expect(lastKeyboard().disabled).toBe(true);
      expect(lastKeyboard().onSelect).toBeUndefined();
      expect(lastKeyboard().selected).toBeNull();
    });

    it('macros tab shows no keyboard and wires the macro persistence props', () => {
      render(<KeebDevicePage />);
      clickTab('keeb.tab.macros');
      expect(screen.queryByTestId('keyboard-stub')).not.toBeInTheDocument();
      expect(screen.getByTestId('macro-stub')).toBeInTheDocument();
      // loadMacro is the hook's function untouched; saveMacro is the page's
      // wrapper that routes failures into the toast throttle.
      expect(lastMacro().loadMacro).toBe(h.loadMacro);
      expect(typeof lastMacro().saveMacro).toBe('function');
    });
  });

  describe('layer chips', () => {
    it('shows the chips only on the key-assignment tab', () => {
      render(<KeebDevicePage />);
      expect(screen.getByLabelText('keeb.layer')).toBeInTheDocument();
      clickTab('keeb.tab.settings');
      expect(screen.queryByLabelText('keeb.layer')).not.toBeInTheDocument();
    });

    it('clicking chip 2 sets layer 1 and clears the selection', () => {
      render(<KeebDevicePage />);
      selectKey();
      expect(lastKeyboard().selected).toEqual({ kind: 'key', x: 2, y: 3 });
      fireEvent.click(screen.getByRole('button', { name: 'keeb.layerN:2' }));
      expect(h.setLayer).toHaveBeenCalledTimes(1);
      expect(h.setLayer).toHaveBeenCalledWith(1);
      expect(lastKeyboard().selected).toBeNull();
    });
  });

  describe('selection routing', () => {
    it('selecting a wheel swaps the body to the rotary view', () => {
      render(<KeebDevicePage />);
      selectWheel();
      expect(screen.queryByTestId('assignment-stub')).not.toBeInTheDocument();
      expect(screen.getByTestId('rotary-stub')).toBeInTheDocument();
      expect(lastRotary().wheel).toBe('left');
    });

    it('selecting a key shows the assignment view with the coordinates', () => {
      render(<KeebDevicePage />);
      selectKey();
      expect(screen.getByTestId('assignment-stub')).toBeInTheDocument();
      expect(lastAssignment().selected).toEqual({ x: 2, y: 3 });
    });

    it('mirrors persisted rotary state from the settings response', () => {
      h.settings = {
        rotaryLeft: 'Scale',
        rotaryRight: 'AltTab',
        rotarySensitivity: 'Fast',
      } as any;
      render(<KeebDevicePage />);
      selectWheel();
      expect(lastRotary().left).toBe('Scale');
      expect(lastRotary().right).toBe('AltTab');
      expect(lastRotary().sensitivity).toBe('Fast');
    });

    it('keeps the rotary defaults when the service omits the fields', () => {
      h.settings = {} as any;
      render(<KeebDevicePage />);
      selectWheel();
      expect(lastRotary().left).toBe('VolumeAdjustment');
      expect(lastRotary().right).toBe('ScrollY');
      expect(lastRotary().sensitivity).toBe('Balanced');
    });
  });

  describe('failed-write toast', () => {
    it('pushes one toast per failure burst and again after the throttle window', async () => {
      h.setKey.mockResolvedValue(false);
      const base = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
      try {
        render(<KeebDevicePage />);
        const setKey = lastAssignment().setKey;
        const body = { mode: 'StandardKey', func: 'A', x: 0, y: 0 };

        await act(async () => { await setKey(body); });
        expect(h.push).toHaveBeenCalledTimes(1);
        expect(h.push).toHaveBeenCalledWith({
          title: 'keeb.write.failedTitle',
          body: 'keeb.write.failedBody',
        });

        nowSpy.mockReturnValue(base + 1000);
        await act(async () => { await setKey(body); });
        expect(h.push).toHaveBeenCalledTimes(1);

        nowSpy.mockReturnValue(base + 5000);
        await act(async () => { await setKey(body); });
        expect(h.push).toHaveBeenCalledTimes(2);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('macro save failure routes through the page toast throttle', async () => {
      h.saveMacro.mockResolvedValue(null);
      const base = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
      try {
        render(<KeebDevicePage />);
        clickTab('keeb.tab.macros');
        const saveMacro = lastMacro().saveMacro;

        let saved: unknown = 'sentinel';
        await act(async () => { saved = await saveMacro(0, []); });
        expect(h.saveMacro).toHaveBeenCalledWith(0, []);
        // The wrapper surfaces the hook's null result to the view...
        expect(saved).toBeNull();
        // ...and pushes the shared throttled failure toast exactly once.
        expect(h.push).toHaveBeenCalledTimes(1);
        expect(h.push).toHaveBeenCalledWith({
          title: 'keeb.write.failedTitle',
          body: 'keeb.write.failedBody',
        });

        nowSpy.mockReturnValue(base + 1000);
        await act(async () => { await saveMacro(0, []); });
        expect(h.push).toHaveBeenCalledTimes(1);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('rotary writes', () => {
    it('reverts left/right when saveRotary fails and keeps them when it succeeds', async () => {
      render(<KeebDevicePage />);
      selectWheel();

      h.saveRotary.mockResolvedValue(false);
      await act(async () => {
        await lastRotary().onSetRotary({ left: 'X', right: 'Y', apps: [] });
      });
      expect(lastRotary().left).toBe('VolumeAdjustment');
      expect(lastRotary().right).toBe('ScrollY');

      h.saveRotary.mockResolvedValue(true);
      await act(async () => {
        await lastRotary().onSetRotary({ left: 'A', right: 'B', apps: [] });
      });
      expect(lastRotary().left).toBe('A');
      expect(lastRotary().right).toBe('B');
    });

    it('reverts sensitivity on failure and keeps it on success', async () => {
      render(<KeebDevicePage />);
      selectWheel();

      h.saveRotarySensitivity.mockResolvedValue(false);
      await act(async () => {
        await lastRotary().onSetSensitivity('Fast');
      });
      expect(lastRotary().sensitivity).toBe('Balanced');

      h.saveRotarySensitivity.mockResolvedValue(true);
      await act(async () => {
        await lastRotary().onSetSensitivity('Fast');
      });
      expect(lastRotary().sensitivity).toBe('Fast');
    });
  });
});
