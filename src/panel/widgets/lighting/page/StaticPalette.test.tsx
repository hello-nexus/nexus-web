import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaticPalette } from './StaticPalette';
import { PALETTE, paletteColor } from '../../../../types/lightingPalette';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('StaticPalette', () => {
  it('renders every swatch', () => {
    const { container } = render(<StaticPalette onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-palette-id]')).toHaveLength(PALETTE.length);
  });

  it('marks only the selected swatch', () => {
    const { container } = render(<StaticPalette selectedId="red-3" onSelect={() => {}} />);
    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute('data-palette-id')).toBe('red-3');
  });

  it('marks nothing when the selection wears an effect instead', () => {
    const { container } = render(<StaticPalette selectedId={null} onSelect={() => {}} />);
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });

  it('hands the whole colour to the caller, not just its id', () => {
    const onSelect = vi.fn();
    const { container } = render(<StaticPalette onSelect={onSelect} />);
    fireEvent.click(container.querySelector('[data-palette-id="blue-3"]')!);
    expect(onSelect).toHaveBeenCalledWith(paletteColor('blue-3'));
  });

  it('names each swatch by family and shade', () => {
    render(<StaticPalette onSelect={() => {}} />);
    expect(screen.getByLabelText('lighting.palette.red 3')).toBeTruthy();
    expect(screen.getByLabelText('lighting.palette.white 1')).toBeTruthy();
  });

  it('carries no custom slot - advanced Static picks from the canvas', () => {
    render(<StaticPalette onSelect={() => {}} />);
    expect(screen.queryByLabelText('common.customColor')).toBeNull();
  });
});
