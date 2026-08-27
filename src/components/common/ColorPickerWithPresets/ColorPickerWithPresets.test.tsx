import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorPickerWithPresets } from './ColorPickerWithPresets';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const PRESETS = ['#111111', '#222222', '#333333'] as const;

// These cover prop wiring and selection state only. fireEvent dispatches
// straight at the handler, so nothing here exercises real hit-testing, the
// popover's outside-click dismissal, or the HsvPicker's pointer drag.

describe('ColorPickerWithPresets', () => {
  it('commits a preset on click and marks it pressed', () => {
    const onCommit = vi.fn();
    render(<ColorPickerWithPresets value="#111111" presets={PRESETS} onCommit={onCommit} />);

    expect(screen.getByLabelText('#111111')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('#222222')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByLabelText('#333333'));
    expect(onCommit).toHaveBeenCalledWith('#333333');
  });

  it('exposes the slot as a disclosure trigger, not a toggle', () => {
    render(<ColorPickerWithPresets value="#111111" presets={PRESETS} onCommit={vi.fn()} allowCustom />);
    const slot = screen.getByLabelText('common.customColor');
    expect(slot).toHaveAttribute('aria-haspopup', 'dialog');
    // aria-pressed alongside aria-expanded reads to AT as a broken toggle: the
    // press state would describe palette selection and never move on click.
    expect(slot).not.toHaveAttribute('aria-pressed');
  });

  it('renders no custom slot unless allowCustom is set', () => {
    render(<ColorPickerWithPresets value="#111111" presets={PRESETS} onCommit={vi.fn()} />);
    expect(screen.queryByLabelText('common.customColor')).toBeNull();
  });

  it('opens the picker popover from the custom slot', () => {
    render(<ColorPickerWithPresets value="#111111" presets={PRESETS} onCommit={vi.fn()} allowCustom />);
    const slot = screen.getByLabelText('common.customColor');

    expect(slot).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(slot);
    expect(slot).toHaveAttribute('aria-expanded', 'true');
    // The HsvPicker's hex input is the popover's only text field.
    expect(screen.getByLabelText('common.hexColor')).toBeInTheDocument();
  });

  it('applies the saved custom color on the click that opens the picker', () => {
    const onCommit = vi.fn();
    render(
      <ColorPickerWithPresets
        value="#111111"
        presets={PRESETS}
        onCommit={onCommit}
        allowCustom
        customColor="#abcdef"
      />,
    );
    fireEvent.click(screen.getByLabelText('common.customColor'));
    expect(onCommit).toHaveBeenCalledWith('#abcdef');
  });

  it('does not re-commit when the slot already shows the current value', () => {
    const onCommit = vi.fn();
    render(
      <ColorPickerWithPresets value="#abcdef" presets={PRESETS} onCommit={onCommit} allowCustom />,
    );
    fireEvent.click(screen.getByLabelText('common.customColor'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits a hex typed into the popover to both the value and the slot', () => {
    const onCommit = vi.fn();
    const onCustomCommit = vi.fn();
    render(
      <ColorPickerWithPresets
        value="#111111"
        presets={PRESETS}
        onCommit={onCommit}
        allowCustom
        customColor=""
        onCustomCommit={onCustomCommit}
      />,
    );
    fireEvent.click(screen.getByLabelText('common.customColor'));
    fireEvent.change(screen.getByLabelText('common.hexColor'), { target: { value: '#abcdef' } });

    expect(onCustomCommit).toHaveBeenCalledWith('#abcdef');
    expect(onCommit).toHaveBeenCalledWith('#abcdef');
  });

  it('paints the saved custom colour into the slot and marks it pressed when selected', () => {
    render(
      <ColorPickerWithPresets
        value="#abcdef"
        presets={PRESETS}
        onCommit={vi.fn()}
        allowCustom
        customColor="#abcdef"
      />,
    );
    const slot = screen.getByLabelText('common.customColor');
    expect(slot).toHaveAttribute('aria-current', 'true');
    expect(slot).toHaveStyle({ background: '#abcdef' });
  });

  it('keeps the saved slot colour after a preset is selected', () => {
    // The whole point of the separate customColor prop: picking a preset must
    // not wipe the slot back to the unset hue wheel.
    render(
      <ColorPickerWithPresets
        value="#222222"
        presets={PRESETS}
        onCommit={vi.fn()}
        allowCustom
        customColor="#abcdef"
      />,
    );
    const slot = screen.getByLabelText('common.customColor');
    expect(slot).toHaveStyle({ background: '#abcdef' });
    expect(slot).toHaveAttribute('aria-current', 'false');
    expect(screen.getByLabelText('#222222')).toHaveAttribute('aria-pressed', 'true');
  });

  it('tracks a live off-palette value over the saved slot colour', () => {
    // Drag preview lands on `value` before onCustomCommit fires on release, so
    // the slot has to follow `value` while it is off-palette or the swatch lags
    // a whole gesture behind the theme it is previewing.
    render(
      <ColorPickerWithPresets
        value="#0f0f0f"
        presets={PRESETS}
        onCommit={vi.fn()}
        allowCustom
        customColor="#abcdef"
      />,
    );
    expect(screen.getByLabelText('common.customColor')).toHaveStyle({ background: '#0f0f0f' });
  });

  it('falls back to an off-palette value when the host persists no slot', () => {
    // Panel accent / background have nowhere to store a slot; free picking
    // still has to show the current colour somewhere in the grid.
    render(
      <ColorPickerWithPresets value="#abcdef" presets={PRESETS} onCommit={vi.fn()} allowCustom />,
    );
    const slot = screen.getByLabelText('common.customColor');
    expect(slot).toHaveStyle({ background: '#abcdef' });
    expect(slot).toHaveAttribute('aria-current', 'true');
  });
});
