// Modal-level tests for the keeb customization view. Verifies the four
// canonical tabs, layer-chip behavior, and the union-selection rules that
// route between Key Assignment and Rotary inside the same tab.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

// react-testing-library doesn't auto-cleanup under Vitest unless globals are
// wired up that way; do it here so every test starts with a clean DOM.
afterEach(() => { cleanup(); });

// "Macros" appears both as a top-level modal tab and as a Key-Assignment
// category pill. Scope every getByRole('tab', …) through these helpers so
// the query targets the right tab bar instead of triggering a duplicate-
// match error.
const modalTab = (name: string) => within(screen.getByRole('tablist', { name: 'Keeb sections' })).getByRole('tab', { name });
const categoryTab = (name: string) => within(screen.getByRole('tablist', { name: 'Assignment categories' })).getByRole('tab', { name });
const queryCategoryTab = (name: string) => {
  const lists = screen.queryAllByRole('tablist', { name: 'Assignment categories' });
  if (lists.length === 0) return null;
  return within(lists[0]).queryByRole('tab', { name });
};
import type { KeebSettings, KeyboardState } from '../../../api/keeb';

// Module-level mock state. Reassigned per test in beforeEach so the hook
// implementation reads fresh values.
let mockState: KeyboardState;
let mockSettings: KeebSettings | null;
let mockLayer = 0;
const setLayer = vi.fn();
const setKey = vi.fn(async () => {});
const resetLayer = vi.fn(async () => {});
const saveFirmwareLighting = vi.fn(async () => {});
const savePassiveLighting = vi.fn(async () => {});
const saveGameMode = vi.fn(async () => {});
const saveRotary = vi.fn(async () => {});
const saveRotarySensitivity = vi.fn(async () => {});

vi.mock('../../../hooks/useKeeb', () => ({
  useKeeb: () => ({
    state: mockState,
    settings: mockSettings,
    loading: false,
    layer: mockLayer,
    setLayer: (l: number) => { mockLayer = l; setLayer(l); },
    refresh: async () => {},
    setKey,
    resetLayer,
    saveFirmwareLighting,
    savePassiveLighting,
    saveGameMode,
    saveRotary,
    saveRotarySensitivity,
  }),
  getKeebLayer: async () => null,
}));

vi.mock('../../../api/keeb', async () => {
  const actual = await vi.importActual<typeof import('../../../api/keeb')>('../../../api/keeb');
  return {
    ...actual,
    getKeebRotaryFunctions: async () => ['VolumeAdjustment', 'ScrollY', 'BrightnessAdjustment'],
    getKeebMacro: async (i: number) => ({ index: i, keys: [] }),
    setKeebMacro: async (i: number, keys: import('../../../api/keeb').MacroKey[]) => ({ index: i, keys }),
  };
});

import { KeebDeviceModal } from './KeebDeviceModal';

function defaultState(): KeyboardState {
  return {
    isConnected: true,
    profile: 0,
    layout: 'ANSI',
    layer: 0,
    keys: [],
  };
}

function defaultSettings(): KeebSettings {
  return {
    shiftKeyDisabled: false,
    windowsKeyDisabled: false,
    altF4Disabled: false,
    altTabDisabled: false,
    animationMode: 'Static',
    speed: 'Medium',
    direction: 'Forward',
    brightness: 50,
    keyIndicator: false,
    keyReactive: false,
    keyReactiveMask: false,
    keyReactiveMode: 'Off',
    keyReactiveColor: { r: 255, g: 255, b: 255, a: 255 },
  };
}

describe('KeebDeviceModal — tab navigation', () => {
  beforeEach(() => {
    cleanup();
    mockState = defaultState();
    mockSettings = defaultSettings();
    mockLayer = 0;
    vi.clearAllMocks();
  });

  it('renders the four canonical tabs (no separate Rotary tab)', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    const list = screen.getByRole('tablist', { name: 'Keeb sections' });
    expect(within(list).getByRole('tab', { name: 'Key Assignment' })).toBeInTheDocument();
    expect(within(list).getByRole('tab', { name: 'Macros' })).toBeInTheDocument();
    expect(within(list).getByRole('tab', { name: 'Tester' })).toBeInTheDocument();
    expect(within(list).getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(within(list).queryByRole('tab', { name: 'Rotary' })).toBeNull();
  });

  it('starts on Key Assignment, switching tabs flips aria-selected', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    expect(modalTab('Key Assignment')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(modalTab('Settings'));
    expect(modalTab('Settings')).toHaveAttribute('aria-selected', 'true');
    expect(modalTab('Key Assignment')).toHaveAttribute('aria-selected', 'false');
  });

  it('keyboard render only appears on Key Assignment + Tester tabs', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    // Key Assignment by default — keyboard visible.
    expect(screen.getByRole('button', { name: 'Left rotary wheel' })).toBeInTheDocument();

    fireEvent.click(modalTab('Macros'));
    expect(screen.queryByRole('button', { name: 'Left rotary wheel' })).toBeNull();

    fireEvent.click(modalTab('Tester'));
    expect(screen.getByRole('button', { name: 'Left rotary wheel' })).toBeInTheDocument();

    fireEvent.click(modalTab('Settings'));
    expect(screen.queryByRole('button', { name: 'Left rotary wheel' })).toBeNull();
  });
});

describe('KeebDeviceModal — layer chips', () => {
  beforeEach(() => {
    cleanup();
    mockState = defaultState();
    mockSettings = defaultSettings();
    mockLayer = 0;
    vi.clearAllMocks();
  });

  it('renders four layer chips on Key Assignment, hides them on other tabs', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Layer ${n}` })).toBeInTheDocument();
    }
    fireEvent.click(modalTab('Settings'));
    expect(screen.queryByRole('button', { name: 'Layer 1' })).toBeNull();
  });

  it('first chip is active (layer 0 ≡ Layer 1 label)', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Layer 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Layer 2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a chip calls setLayer with the (1-based label minus 1)', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layer 3' }));
    expect(setLayer).toHaveBeenCalledWith(2);
  });
});

describe('KeebDeviceModal — key/wheel selection routes to the right sub-view', () => {
  beforeEach(() => {
    mockState = defaultState();
    mockSettings = defaultSettings();
    mockLayer = 0;
    vi.clearAllMocks();
    cleanup();
  });

  it('with nothing selected, Key Assignment shows the "click a key" hint', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    expect(screen.getByText(/Click a key on the keyboard above first/i)).toBeInTheDocument();
  });

  it('clicking a physical key shows the function categories pill bar', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    // The modal renders through a portal to document.body, so query off it
    // instead of the render `container` (which only holds the portal anchor).
    const a = document.body.querySelector('button[title="A"]') as HTMLButtonElement;
    expect(a).not.toBeNull();
    fireEvent.click(a);
    expect(categoryTab('Keyboard')).toBeInTheDocument();
    expect(categoryTab('Mouse')).toBeInTheDocument();
  });

  it('clicking a wheel hides the function categories and shows the rotary picker', async () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Left rotary wheel' }));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByText(/Editing:/i)).toBeInTheDocument();
    expect(screen.getByText(/Left Wheel/)).toBeInTheDocument();
    expect(queryCategoryTab('Mouse')).toBeNull();
  });

  it('switching layer clears any selection so the previous picker disappears', () => {
    render(<KeebDeviceModal open onClose={() => {}} />);
    // The modal renders through a portal to document.body, so query off it
    // instead of the render `container` (which only holds the portal anchor).
    const a = document.body.querySelector('button[title="A"]') as HTMLButtonElement;
    expect(a).not.toBeNull();
    fireEvent.click(a);
    expect(categoryTab('Keyboard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Layer 2' }));
    expect(screen.getByText(/Click a key on the keyboard above first/i)).toBeInTheDocument();
  });
});

describe('KeebDeviceModal — offline state', () => {
  beforeEach(() => {
    cleanup();
    mockState = defaultState();
    mockSettings = defaultSettings();
    mockLayer = 0;
    vi.clearAllMocks();
  });

  it('shows the offline banner on the keyboard render when state.isConnected is false', () => {
    mockState = { ...defaultState(), isConnected: false };
    render(<KeebDeviceModal open onClose={() => {}} />);
    expect(screen.getByText(/Connect your Keeb TKL/i)).toBeInTheDocument();
  });

  it('title appends "(offline)" when state.isConnected is false', () => {
    mockState = { ...defaultState(), isConnected: false };
    render(<KeebDeviceModal open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /Keeb TKL \(offline\)/i })).toBeInTheDocument();
  });
});
