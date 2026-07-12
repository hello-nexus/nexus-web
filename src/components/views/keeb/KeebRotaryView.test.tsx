// Rotary view tests - verifies the wheel/side editing flow and that picking
// a function updates the correct side in the SetRotaryWheelsBody. Header
// copy and aria-labels are asserted against locale keys via the key-echo
// i18n mock; tile labels fall back to the camelCase split when t() echoes
// the key.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KeebRotaryView } from './KeebRotaryView';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

vi.mock('../../../api/keeb', async () => {
  const actual = await vi.importActual<typeof import('../../../api/keeb')>('../../../api/keeb');
  return {
    ...actual,
    getKeebRotaryFunctions: async () => [
      'VolumeAdjustment', 'BrightnessAdjustment', 'ScrollY', 'AltTab',
    ],
  };
});

afterEach(() => { cleanup(); });

async function tick() {
  await new Promise(r => setTimeout(r, 0));
}

describe('KeebRotaryView', () => {
  let onSetRotary: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSetRotary = vi.fn(async () => {});
  });

  function renderView(wheel: 'left' | 'right') {
    return render(
      <KeebRotaryView
        wheel={wheel}
        left="VolumeAdjustment"
        right="ScrollY"
        onSetRotary={onSetRotary}
      />
    );
  }

  it('shows which wheel is being edited based on the wheel prop', () => {
    const { rerender } = renderView('left');
    expect(screen.getByText('keeb.rotary.editingLeft')).toBeInTheDocument();

    rerender(
      <KeebRotaryView
        wheel="right"
        left="VolumeAdjustment"
        right="ScrollY"
        onSetRotary={onSetRotary}
      />
    );
    expect(screen.getByText('keeb.rotary.editingRight')).toBeInTheDocument();
  });

  it('renders function tiles from getKeebRotaryFunctions and marks the active one', async () => {
    renderView('left');
    await tick();

    // The key-echo mock makes t() return the key itself, so the label falls
    // back to the camelCase split of the function name.
    const volume = screen.getByRole('button', { name: 'Volume Adjustment' });
    expect(volume).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Scroll Y' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a function tile while editing the left wheel sends { left: picked, right: unchanged }', async () => {
    renderView('left');
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'Alt Tab' }));
    expect(onSetRotary).toHaveBeenCalledWith({ left: 'AltTab', right: 'ScrollY' });
  });

  it('clicking a function tile while editing the right wheel sends { left: unchanged, right: picked }', async () => {
    renderView('right');
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'Brightness Adjustment' }));
    expect(onSetRotary).toHaveBeenCalledWith({ left: 'VolumeAdjustment', right: 'BrightnessAdjustment' });
  });
});
