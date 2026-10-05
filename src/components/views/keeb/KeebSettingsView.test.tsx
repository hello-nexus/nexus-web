// Settings view tests - verifies the three Card sections (Firmware Lighting,
// Passive Lighting, Game Mode): firmware and game mode write to the right
// onSave* callback with the correct body shape, the direction icon-buttons
// toggle, and the passive section hosts the shared Type reactive editor for
// the keyboard's lighting card. Controls are queried by their aria-labels, which are locale keys under
// the key-echo i18n mock; the option VALUES stay raw firmware enums.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import type { KeebSettings } from '../../../api/keeb';
import { DEFAULT_KEY_REACTION } from '../../../api/keyReactive';
import { KeebSettingsView } from './KeebSettingsView';

const api = vi.hoisted(() => ({
  fetchState: vi.fn(),
  put: vi.fn(),
  press: vi.fn(),
  preview: vi.fn(),
  post: vi.fn(),
  stream: vi.fn(),
}));

vi.mock('../../../api/keyReactive', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/keyReactive')>()),
  fetchKeyReactive: api.fetchState,
  putKeyReaction: api.put,
  pressKeyReaction: api.press,
  fetchKeyReactionPreview: api.preview,
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: (enabled: boolean) => api.stream(enabled),
}));

// POSTs (the editor's presses) are stubbed so no request leaves the test.
vi.mock('../../../api/service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/service')>()),
  postService: api.post,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

// Drive the dropdown as a native <select>: these tests exercise the view's
// firmware-lighting wiring, not the custom Select's open/close mechanics.
vi.mock('../../common/Select/Select', () => ({
  Select: ({ value, onChange, options, children, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean }[]; children?: React.ReactNode;
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options ? options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>) : children}
    </select>
  ),
}));

beforeEach(() => {
  api.fetchState.mockResolvedValue(null);
  api.stream.mockReturnValue({ connected: false, live: false });
});

afterEach(() => { cleanup(); });

function defaultSettings(overrides: Partial<KeebSettings> = {}): KeebSettings {
  return {
    shiftKeyDisabled: false,
    windowsKeyDisabled: false,
    altF4Disabled: false,
    altTabDisabled: false,
    animationMode: 'Static',
    speed: 'Standard',
    direction: 'LeftToRight',
    brightness: 50,
    keyIndicator: false,
    ...overrides,
  };
}

describe('KeebSettingsView - loading state', () => {
  it('renders the loading placeholder when settings is null', () => {
    render(
      <KeebSettingsView
        settings={null}
        onSaveFirmwareLighting={async () => {}}
        onSaveGameMode={async () => {}}
      />
    );
    expect(screen.getByText('keeb.loading')).toBeInTheDocument();
  });
});

describe('KeebSettingsView - firmware lighting', () => {
  let onSaveFw: ReturnType<typeof vi.fn>;
  let onSaveGame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSaveFw = vi.fn(async () => {});
    onSaveGame = vi.fn(async () => {});
  });

  it('renders effect / speed selectors with the current values', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ animationMode: 'Rainbow', speed: 'Energetic' })}
        onSaveFirmwareLighting={onSaveFw}
        onSaveGameMode={onSaveGame}
      />
    );
    const effect = screen.getByLabelText('keeb.settings.effect') as HTMLSelectElement;
    const speed = screen.getByLabelText('keeb.settings.speed') as HTMLSelectElement;
    expect(effect.value).toBe('Rainbow');
    expect(speed.value).toBe('Energetic');
  });

  it('changing the effect select calls onSaveFirmwareLighting with the new mode', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings()}
        onSaveFirmwareLighting={onSaveFw}
        onSaveGameMode={onSaveGame}
      />
    );
    const effect = screen.getByLabelText('keeb.settings.effect') as HTMLSelectElement;
    fireEvent.change(effect, { target: { value: 'PingPong' } });
    expect(onSaveFw).toHaveBeenCalledWith(expect.objectContaining({ animationMode: 'PingPong' }));
  });

  it('clicking a direction icon button updates the active state and saves', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ direction: 'LeftToRight' })}
        onSaveFirmwareLighting={onSaveFw}
        onSaveGameMode={onSaveGame}
      />
    );
    fireEvent.click(screen.getByLabelText('keeb.dir.RightToLeft'));
    expect(onSaveFw).toHaveBeenCalledWith(expect.objectContaining({ direction: 'RightToLeft' }));
  });
});

function keebDevice(over: Record<string, unknown> = {}) {
  return {
    id: 'card-keeb', deviceId: 'keeb:SN1', frameIndex: 2, hardwareKeys: true,
    ledCount: 2, namedKeys: 2, config: { ...DEFAULT_KEY_REACTION, enabled: true }, ...over,
  };
}

describe('KeebSettingsView - passive lighting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    api.stream.mockReturnValue({ connected: false, live: false });
    api.preview.mockResolvedValue({ x: [0, 1], y: [0, 0], width: 2, height: 1, fps: 30, frameCount: 1, frames: btoa('\0\0\0\0\0\0') });
    api.put.mockImplementation(async (_id: string, cfg: unknown) => cfg);
    api.press.mockResolvedValue({ ok: true });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const renderView = async () => {
    await act(async () => {
      render(
        <KeebSettingsView
          settings={defaultSettings()}
          onSaveFirmwareLighting={async () => {}}
          onSaveGameMode={async () => {}}
        />
      );
    });
  };

  it('binds the shared editor to the first keeb: card', async () => {
    api.fetchState.mockResolvedValue({
      inputAvailable: false,
      devices: [
        keebDevice({ id: 'other', deviceId: 'strip:1' }),
        keebDevice(),
      ],
    });
    await renderView();
    expect(screen.getByRole('group', { name: 'lighting.keyReactions.effect' })).toBeInTheDocument();
    // The on/off row leads the section.
    expect(screen.getByRole('switch', { name: 'lighting.keyReactions.title' })).toBeInTheDocument();
    // Its own key events count as typing even with no OS key source.
    expect(screen.getByText('lighting.keyReactions.previewHint')).toBeInTheDocument();
    // The stream is requested for the live preview.
    expect(api.stream).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.keyReactions.effects.trace.name' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][0]).toBe('card-keeb');
  });

  it('shows the unavailable note when no keeb card exists', async () => {
    api.fetchState.mockResolvedValue({ inputAvailable: true, devices: [keebDevice({ deviceId: 'strip:1' })] });
    await renderView();
    expect(screen.getByText('keeb.settings.typeReactiveMissing')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'lighting.keyReactions.effect' })).toBeNull();
    expect(api.stream).toHaveBeenLastCalledWith(false);
  });

  it('shows the note when the card list cannot be fetched', async () => {
    api.fetchState.mockResolvedValue(null);
    await renderView();
    expect(screen.getByText('keeb.settings.typeReactiveMissing')).toBeInTheDocument();
  });
});

describe('KeebSettingsView - game mode', () => {
  let onSaveGame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSaveGame = vi.fn(async () => {});
  });

  it('all four lockout toggles render and forward to onSaveGameMode with named booleans', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings()}
        onSaveFirmwareLighting={async () => {}}
        onSaveGameMode={onSaveGame}
      />
    );
    fireEvent.click(screen.getByLabelText('keeb.settings.game.altF4'));
    expect(onSaveGame).toHaveBeenCalledWith(expect.objectContaining({ altF4: true }));

    fireEvent.click(screen.getByLabelText('keeb.settings.game.shiftTab'));
    expect(onSaveGame).toHaveBeenLastCalledWith(expect.objectContaining({ shiftTab: true }));

    fireEvent.click(screen.getByLabelText('keeb.settings.game.windowsKey'));
    expect(onSaveGame).toHaveBeenLastCalledWith(expect.objectContaining({ windowsKey: true }));

    fireEvent.click(screen.getByLabelText('keeb.settings.game.altTab'));
    expect(onSaveGame).toHaveBeenLastCalledWith(expect.objectContaining({ altTab: true }));
  });
});
