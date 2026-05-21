// Rotary view tests — verifies the wheel/side editing flow, picking a
// function updates the correct side in the SetRotaryWheelsBody, the
// sensitivity Select drives onSetSensitivity, and the App-scope dropdown
// is disabled (until AppDetection lands).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KeebRotaryView } from './KeebRotaryView';

afterEach(() => { cleanup(); });

vi.mock('../../../api/keeb', async () => {
  const actual = await vi.importActual<typeof import('../../../api/keeb')>('../../../api/keeb');
  return {
    ...actual,
    getKeebRotaryFunctions: async () => [
      'VolumeAdjustment', 'BrightnessAdjustment', 'ScrollY', 'AltTab',
    ],
  };
});

async function tick() {
  await new Promise(r => setTimeout(r, 0));
}

describe('KeebRotaryView', () => {
  let onSetRotary: ReturnType<typeof vi.fn>;
  let onSetSensitivity: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSetRotary = vi.fn(async () => {});
    onSetSensitivity = vi.fn(async () => {});
  });

  it('shows which wheel is being edited based on the wheel prop', () => {
    const { rerender } = render(
      <KeebRotaryView
        wheel="left"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    expect(screen.getByText(/Left Wheel/)).toBeInTheDocument();

    rerender(
      <KeebRotaryView
        wheel="right"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    expect(screen.getByText(/Right Wheel/)).toBeInTheDocument();
  });

  it('app-scope dropdown is disabled until AppDetection lands', () => {
    render(
      <KeebRotaryView
        wheel="left"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    const scope = screen.getByLabelText('App scope') as HTMLSelectElement;
    expect(scope).toBeDisabled();
  });

  it('renders function tiles from getKeebRotaryFunctions and marks the active one', async () => {
    render(
      <KeebRotaryView
        wheel="left"
        left="BrightnessAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    await tick();
    expect(screen.getByRole('button', { name: 'VolumeAdjustment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BrightnessAdjustment' })).toBeInTheDocument();
    // Active = left wheel's current value
    expect(screen.getByRole('button', { name: 'BrightnessAdjustment' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'VolumeAdjustment' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a function tile while editing the left wheel sends body { left: <picked>, right: <unchanged>, apps: [] }', async () => {
    render(
      <KeebRotaryView
        wheel="left"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'AltTab' }));
    expect(onSetRotary).toHaveBeenCalledWith({ left: 'AltTab', right: 'ScrollY', apps: [] });
  });

  it('clicking a function tile while editing the right wheel sends body { left: <unchanged>, right: <picked>, apps: [] }', async () => {
    render(
      <KeebRotaryView
        wheel="right"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'BrightnessAdjustment' }));
    expect(onSetRotary).toHaveBeenCalledWith({ left: 'VolumeAdjustment', right: 'BrightnessAdjustment', apps: [] });
  });

  it('changing sensitivity invokes onSetSensitivity with the new level', () => {
    render(
      <KeebRotaryView
        wheel="left"
        left="VolumeAdjustment"
        right="ScrollY"
        sensitivity="Balanced"
        onSetRotary={onSetRotary}
        onSetSensitivity={onSetSensitivity}
      />
    );
    const sens = screen.getByLabelText('Rotary sensitivity') as HTMLSelectElement;
    fireEvent.change(sens, { target: { value: 'Turbo' } });
    expect(onSetSensitivity).toHaveBeenCalledWith('Turbo');
  });
});
