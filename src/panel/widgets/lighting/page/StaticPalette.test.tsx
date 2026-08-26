import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaticPalette } from './StaticPalette';
import { PALETTE, paletteColor } from '../../../../types/lightingPalette';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('StaticPalette', () => {
  it('renders every swatch', () => {
    const { container } = render(
      <StaticPalette open onToggle={() => {}} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('[data-palette-id]')).toHaveLength(PALETTE.length);
  });

  it('marks only the selected swatch', () => {
    const { container } = render(
      <StaticPalette selectedId="red-3" open onToggle={() => {}} onSelect={() => {}} />,
    );
    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute('data-palette-id')).toBe('red-3');
  });

  it('marks nothing when the selection wears an effect instead', () => {
    const { container } = render(
      <StaticPalette selectedId={null} open onToggle={() => {}} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });

  it('hands the whole colour to the caller, not just its id', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StaticPalette open onToggle={() => {}} onSelect={onSelect} />,
    );
    const swatch = container.querySelector('[data-palette-id="blue-3"]')!;
    fireEvent.click(swatch);
    expect(onSelect).toHaveBeenCalledWith(paletteColor('blue-3'));
  });

  it('names each swatch by family and shade', () => {
    render(<StaticPalette open onToggle={() => {}} onSelect={() => {}} />);
    expect(screen.getByLabelText('lighting.palette.red 3')).toBeTruthy();
    expect(screen.getByLabelText('lighting.palette.white 1')).toBeTruthy();
  });

  it('renders no custom slot without onSelectCustom, nor in hero mode', () => {
    const { rerender } = render(
      <StaticPalette open onToggle={() => {}} onSelect={() => {}} />,
    );
    expect(screen.queryByLabelText('common.customColor')).toBeNull();
    rerender(<StaticPalette hero onSelect={() => {}} onSelectCustom={() => {}} />);
    expect(screen.queryByLabelText('common.customColor')).toBeNull();
  });

  it('applies the colour the slot already shows on click', () => {
    const onSelectCustom = vi.fn();
    render(
      <StaticPalette
        open onToggle={() => {}} onSelect={() => {}}
        customColor="#abcdef" onSelectCustom={onSelectCustom}
      />,
    );
    fireEvent.click(screen.getByLabelText('common.customColor'));
    expect(onSelectCustom).toHaveBeenCalledWith('#abcdef');
  });

  it('opens the picker without applying when the slot has no colour yet', () => {
    const onSelectCustom = vi.fn();
    render(
      <StaticPalette open onToggle={() => {}} onSelect={() => {}} onSelectCustom={onSelectCustom} />,
    );
    const slot = screen.getByLabelText('common.customColor');
    fireEvent.click(slot);
    expect(onSelectCustom).not.toHaveBeenCalled();
    expect(slot).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not re-apply when the click closes the picker', () => {
    const onSelectCustom = vi.fn();
    render(
      <StaticPalette
        open onToggle={() => {}} onSelect={() => {}}
        customColor="#abcdef" onSelectCustom={onSelectCustom}
      />,
    );
    const slot = screen.getByLabelText('common.customColor');
    fireEvent.click(slot);
    fireEvent.click(slot);
    expect(onSelectCustom).toHaveBeenCalledTimes(1);
  });

  it('marks the slot current and clears the grid when the pick is off-palette', () => {
    const { container } = render(
      <StaticPalette
        selectedId={null} open onToggle={() => {}} onSelect={() => {}}
        customColor="#abcdef" customSelected onSelectCustom={() => {}}
      />,
    );
    expect(screen.getByLabelText('common.customColor')).toHaveAttribute('aria-current', 'true');
    expect(container.querySelectorAll('[data-palette-id][aria-pressed="true"]')).toHaveLength(0);
  });
});
