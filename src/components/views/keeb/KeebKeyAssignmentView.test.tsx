// Key Assignment view tests - verifies the function-tile flow (click a
// category, click a tile -> setKey with the right body), the click-to-pick
// source-keyboard flow (Keyboard category), and the ConfirmModal-backed
// Reset Layer flow. Copy is asserted against locale keys via the key-echo
// i18n mock; the interpolation-aware t() appends params as " k=v".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { KeyboardState } from '../../../api/keeb';
import { KeebKeyAssignmentView } from './KeebKeyAssignmentView';

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

function defaultState(): KeyboardState {
  return {
    isConnected: true,
    profile: 0,
    layout: 'ANSI',
    layer: 0,
    keys: [],
  };
}

const categoryTab = (name: string) => within(screen.getByRole('tablist', { name: 'keeb.assign.categoriesAria' })).getByRole('tab', { name });

describe('KeebKeyAssignmentView - gating on selection', () => {
  let setKey: ReturnType<typeof vi.fn>;
  let resetLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setKey = vi.fn(async () => {});
    resetLayer = vi.fn(async () => {});
  });

  it('shows the "click a key first" hint when no selection is set', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    expect(screen.getByText('keeb.assign.hint')).toBeInTheDocument();
  });

  it('renders the Keyboard category tab first and selects it by default', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    expect(categoryTab('keeb.category.keyboard')).toHaveAttribute('aria-selected', 'true');
    expect(categoryTab('keeb.category.mouse')).toBeInTheDocument();
    expect(categoryTab('keeb.category.systemApps')).toBeInTheDocument();
    expect(categoryTab('keeb.category.lightingProfiles')).toBeInTheDocument();
    expect(categoryTab('keeb.category.macros')).toBeInTheDocument();
  });

  it('with no selection, function tiles are disabled (the Mouse "Left Click" tile)', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    fireEvent.click(categoryTab('keeb.category.mouse'));
    const tile = screen.getByRole('radio', { name: 'keeb.fn.MouseLButton' });
    expect(tile).toBeDisabled();
  });
});

describe('KeebKeyAssignmentView - function-tile writes', () => {
  let setKey: ReturnType<typeof vi.fn>;
  let resetLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setKey = vi.fn(async () => {});
    resetLayer = vi.fn(async () => {});
  });

  it('clicking a Mouse tile calls setKey with the selected (x,y), function, mode', () => {
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    fireEvent.click(categoryTab('keeb.category.mouse'));
    fireEvent.click(screen.getByRole('radio', { name: 'keeb.fn.MouseLButton' }));
    expect(setKey).toHaveBeenCalledWith({ x: 5, y: 1, func: 'MouseLButton', mode: 'MouseKey', input: null });
  });

  it('clicking a Lighting tile forwards the layer-key input (e.g. RGBEffectValue with input 1)', () => {
    render(<KeebKeyAssignmentView selected={{ x: 3, y: 4 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    fireEvent.click(categoryTab('keeb.category.lightingProfiles'));
    fireEvent.click(screen.getByRole('radio', { name: 'keeb.fn.RGBEffectValue' }));
    expect(setKey).toHaveBeenCalledWith({ x: 3, y: 4, func: 'RGBEffectValue', mode: 'RGBKey', input: 1 });
  });

  it('clicking a Macro tile forwards the repeat-mode input (1)', () => {
    render(<KeebKeyAssignmentView selected={{ x: 6, y: 2 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    fireEvent.click(categoryTab('keeb.category.macros'));
    // Macro tiles label through t(labelKey, { n }) - params echo as " n=1".
    fireEvent.click(screen.getByRole('radio', { name: 'keeb.fn.macroN n=1' }));
    expect(setKey).toHaveBeenCalledWith({ x: 6, y: 2, func: 'Macro1', mode: 'MacroKey', input: 1 });
  });
});

describe('KeebKeyAssignmentView - Keyboard category (click-to-pick source keyboard)', () => {
  let setKey: ReturnType<typeof vi.fn>;
  let resetLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setKey = vi.fn(async () => {});
    resetLayer = vi.fn(async () => {});
  });

  it('renders the source keyboard with NO rotary wheels', () => {
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    expect(screen.queryByRole('button', { name: 'keeb.keyboard.leftWheel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'keeb.keyboard.rightWheel' })).toBeNull();
  });

  it('clicking a source-keyboard key writes that key\'s default function onto the target', () => {
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    // Click "Q" on the source keyboard -> its default function/mode lands on the target (5,1).
    const q = document.body.querySelector('button[title="Q"]') as HTMLButtonElement;
    expect(q).not.toBeNull();
    fireEvent.click(q);
    expect(setKey).toHaveBeenCalledWith({ x: 5, y: 1, func: 'Q', mode: 'StandardKey' });
  });

  it('source-keyboard click is a no-op when no target key is selected', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    const q = document.body.querySelector('button[title="Q"]') as HTMLButtonElement;
    expect(q).not.toBeNull();
    fireEvent.click(q);
    expect(setKey).not.toHaveBeenCalled();
  });
});

describe('KeebKeyAssignmentView - source keyboard highlight reflects current mapping', () => {
  let setKey: ReturnType<typeof vi.fn>;
  let resetLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setKey = vi.fn(async () => {});
    resetLayer = vi.fn(async () => {});
  });

  function stateWithAssignment(x: number, y: number, fn: string): KeyboardState {
    // Sparse keys array - only the target row needs to be populated for the
    // highlight lookup.
    const keys: KeyboardState['keys'] = Array.from({ length: 8 }, () => []);
    keys[x] = [];
    for (let i = 0; i <= y; i++) {
      keys[x][i] = { mode: 'StandardKey', function: i === y ? fn : '', input: null };
    }
    return { ...defaultState(), keys };
  }

  it('with no selection, no source-keyboard cell is highlighted', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    // No `keySelected` class anywhere on the source keyboard.
    const highlighted = document.body.querySelectorAll('button[class*="keySelected"]');
    expect(highlighted.length).toBe(0);
  });

  it('selecting a target with its default mapping highlights that key on the source keyboard', () => {
    // Target (5, 1) defaults to A. With no override, source A should highlight.
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    const a = document.body.querySelector('button[title="A"]') as HTMLButtonElement;
    expect(a.className).toMatch(/keySelected/);
  });

  it('selecting a target that has been remapped highlights the *new* mapping on the source keyboard', () => {
    // Target (5, 1) (the A cell) currently has Q assigned to it.
    // Source A should NOT highlight; source Q should.
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={stateWithAssignment(5, 1, 'Q')} setKey={setKey} resetLayer={resetLayer} />);
    const a = document.body.querySelector('button[title="A"]') as HTMLButtonElement;
    const q = document.body.querySelector('button[title="Q"]') as HTMLButtonElement;
    expect(a.className).not.toMatch(/keySelected/);
    expect(q.className).toMatch(/keySelected/);
  });

  it('selecting a target mapped to a non-keyboard function (Macro1) highlights nothing on the source', () => {
    render(<KeebKeyAssignmentView selected={{ x: 2, y: 5 }} state={stateWithAssignment(2, 5, 'Macro1')} setKey={setKey} resetLayer={resetLayer} />);
    const highlighted = document.body.querySelectorAll('button[class*="keySelected"]');
    expect(highlighted.length).toBe(0);
  });

  it('clicking a different source key while a remap is highlighted rebinds the target', () => {
    // Target (5, 1) currently mapped to Q. User clicks Z on the source -> setKey
    // should be called with Z's StandardKey definition.
    render(<KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={stateWithAssignment(5, 1, 'Q')} setKey={setKey} resetLayer={resetLayer} />);
    const z = document.body.querySelector('button[title="Z"]') as HTMLButtonElement;
    expect(z).not.toBeNull();
    fireEvent.click(z);
    expect(setKey).toHaveBeenCalledWith({ x: 5, y: 1, func: 'Z', mode: 'StandardKey' });
  });

  it('highlight updates when the user picks a different top-keyboard cell', () => {
    const { rerender } = render(
      <KeebKeyAssignmentView selected={{ x: 5, y: 1 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />,
    );
    // A is highlighted because (5,1) defaults to A.
    expect((document.body.querySelector('button[title="A"]') as HTMLButtonElement).className).toMatch(/keySelected/);

    // Switch target to (5, 2) -> defaults to S.
    rerender(
      <KeebKeyAssignmentView selected={{ x: 5, y: 2 }} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />,
    );
    expect((document.body.querySelector('button[title="A"]') as HTMLButtonElement).className).not.toMatch(/keySelected/);
    expect((document.body.querySelector('button[title="S"]') as HTMLButtonElement).className).toMatch(/keySelected/);
  });
});

describe('KeebKeyAssignmentView - Reset Layer confirm flow', () => {
  let setKey: ReturnType<typeof vi.fn>;
  let resetLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setKey = vi.fn(async () => {});
    resetLayer = vi.fn(async () => {});
  });

  const openConfirm = () => {
    fireEvent.click(screen.getByRole('button', { name: 'keeb.assign.reset' }));
    return screen.getByRole('alertdialog', { name: 'keeb.assign.resetTitle' });
  };

  it('clicking Reset opens the confirm modal but does NOT reset', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    const dialog = openConfirm();
    // Message interpolates the human layer number (state.layer is zero-based).
    expect(within(dialog).getByText('keeb.assign.resetMessage layer=1')).toBeInTheDocument();
    expect(resetLayer).not.toHaveBeenCalled();
  });

  it('confirming in the modal calls resetLayer and closes it', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'keeb.assign.reset' }));
    expect(resetLayer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog', { name: 'keeb.assign.resetTitle' })).toBeNull();
  });

  it('cancelling the modal closes it without resetting', () => {
    render(<KeebKeyAssignmentView selected={null} state={defaultState()} setKey={setKey} resetLayer={resetLayer} />);
    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.cancel' }));
    expect(resetLayer).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog', { name: 'keeb.assign.resetTitle' })).toBeNull();
  });
});
