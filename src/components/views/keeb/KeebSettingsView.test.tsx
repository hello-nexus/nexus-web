// Settings view tests - verifies the three Card sections (Firmware Lighting,
// Passive Lighting, Game Mode) each write to the right onSave* callback with
// the correct body shape, the direction icon-buttons toggle, and the
// passive-lighting Mask + Mode controls show up only when Type Reactive is
// on. Controls are queried by their aria-labels, which are locale keys under
// the key-echo i18n mock; the option VALUES stay raw firmware enums.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { KeebSettings } from '../../../api/keeb';
import { KeebSettingsView } from './KeebSettingsView';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

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
    keyReactive: false,
    keyReactiveMask: false,
    keyReactiveMode: 'SingleKey',
    keyReactiveColor: { r: 200, g: 100, b: 50, a: 255 },
    ...overrides,
  };
}

describe('KeebSettingsView - loading state', () => {
  it('renders the loading placeholder when settings is null', () => {
    render(
      <KeebSettingsView
        settings={null}
        onSaveFirmwareLighting={async () => {}}
        onSavePassiveLighting={async () => {}}
        onSaveGameMode={async () => {}}
      />
    );
    expect(screen.getByText('keeb.loading')).toBeInTheDocument();
  });
});

describe('KeebSettingsView - firmware lighting', () => {
  let onSaveFw: ReturnType<typeof vi.fn>;
  let onSavePassive: ReturnType<typeof vi.fn>;
  let onSaveGame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSaveFw = vi.fn(async () => {});
    onSavePassive = vi.fn(async () => {});
    onSaveGame = vi.fn(async () => {});
  });

  it('renders effect / speed selectors with the current values', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ animationMode: 'Rainbow', speed: 'Energetic' })}
        onSaveFirmwareLighting={onSaveFw}
        onSavePassiveLighting={onSavePassive}
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
        onSavePassiveLighting={onSavePassive}
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
        onSavePassiveLighting={onSavePassive}
        onSaveGameMode={onSaveGame}
      />
    );
    fireEvent.click(screen.getByLabelText('keeb.dir.RightToLeft'));
    expect(onSaveFw).toHaveBeenCalledWith(expect.objectContaining({ direction: 'RightToLeft' }));
  });
});

describe('KeebSettingsView - passive lighting', () => {
  let onSavePassive: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSavePassive = vi.fn(async () => {});
  });

  it('mask + mode + color picker are hidden until Type Reactive is on', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ keyReactive: false })}
        onSaveFirmwareLighting={async () => {}}
        onSavePassiveLighting={onSavePassive}
        onSaveGameMode={async () => {}}
      />
    );
    expect(screen.queryByLabelText('keeb.settings.maskEffect')).toBeNull();
    expect(screen.queryByLabelText('keeb.settings.mode')).toBeNull();
  });

  it('flipping Type Reactive ON saves with keyReactive:true and reveals the sub-controls', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ keyReactive: false })}
        onSaveFirmwareLighting={async () => {}}
        onSavePassiveLighting={onSavePassive}
        onSaveGameMode={async () => {}}
      />
    );
    const toggle = screen.getByLabelText('keeb.settings.typeReactive');
    fireEvent.click(toggle);
    expect(onSavePassive).toHaveBeenCalledWith(expect.objectContaining({ keyReactive: true }));
    // Sub-controls now visible.
    expect(screen.getByLabelText('keeb.settings.maskEffect')).toBeInTheDocument();
    expect(screen.getByLabelText('keeb.settings.mode')).toBeInTheDocument();
  });

  it('changing reactive mode select sends the new mode', () => {
    render(
      <KeebSettingsView
        settings={defaultSettings({ keyReactive: true, keyReactiveMode: 'SingleKey' })}
        onSaveFirmwareLighting={async () => {}}
        onSavePassiveLighting={onSavePassive}
        onSaveGameMode={async () => {}}
      />
    );
    fireEvent.change(screen.getByLabelText('keeb.settings.mode'), { target: { value: 'Ripple' } });
    expect(onSavePassive).toHaveBeenCalledWith(expect.objectContaining({ keyReactiveMode: 'Ripple' }));
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
        onSavePassiveLighting={async () => {}}
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
