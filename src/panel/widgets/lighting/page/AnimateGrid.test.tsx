import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimateGrid } from './AnimateGrid';

vi.mock('../../../../hooks/useEffectThumbnail', () => ({
  useEffectThumbnail: () => null,
}));
vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AnimateGrid live-on-RGB bulb', () => {
  it('marks exactly the rgb-active effect cell with a bulb', () => {
    const { container } = render(
      <AnimateGrid
        effect="plasma"
        onSelect={() => {}}
        slotFor={() => 0}
        versionFor={() => '0'}
        rgbActiveEffect="plasma"
      />,
    );
    expect(container.querySelectorAll('svg.lucide-lightbulb').length).toBe(1);
  });

  it('shows no bulb when nothing is live on the RGB (e.g. the lighting page)', () => {
    const { container } = render(
      <AnimateGrid
        effect="plasma"
        onSelect={() => {}}
        slotFor={() => 0}
        versionFor={() => '0'}
        rgbActiveEffect=""
      />,
    );
    expect(container.querySelectorAll('svg.lucide-lightbulb').length).toBe(0);
  });

  it('stacks a monitor icon on a panel-used effect, alongside the bulb', () => {
    const { container } = render(
      <AnimateGrid
        effect="plasma"
        onSelect={() => {}}
        slotFor={() => 0}
        versionFor={() => '0'}
        rgbActiveEffect="plasma"
        panelEffects={new Set(['plasma'])}
      />,
    );
    // plasma is both live on the LEDs and used by a panel → both badges.
    expect(container.querySelectorAll('svg.lucide-lightbulb').length).toBe(1);
    expect(container.querySelectorAll('svg.lucide-monitor').length).toBe(1);
  });

  it('shows no monitor when no panel uses the effect', () => {
    const { container } = render(
      <AnimateGrid
        effect="plasma"
        onSelect={() => {}}
        slotFor={() => 0}
        versionFor={() => '0'}
        panelEffects={new Set()}
      />,
    );
    expect(container.querySelectorAll('svg.lucide-monitor').length).toBe(0);
  });
});

describe('AnimateGrid category sections', () => {
  const has = (c: HTMLElement, key: string) => !!c.querySelector(`[data-effect-key="${key}"]`);

  it('lists every effect under pre-expanded category groups (no filtering)', () => {
    const { container } = render(<AnimateGrid effect="" onSelect={() => {}} />);
    expect(has(container, 'fire')).toBe(true);         // organic
    expect(has(container, 'boxtunnel')).toBe(true);    // geometric
    expect(has(container, 'spectrumbars')).toBe(true); // audio
  });

  it('orders sections simple, organic, then the rest with audio last', () => {
    const { container } = render(<AnimateGrid effect="" onSelect={() => {}} />);
    const text = container.textContent || '';
    const order = ['simple', 'organic', 'cosmic', 'geometric', 'pattern', 'audio'];
    const idxs = order.map(c => text.indexOf(`lighting.category.${c}`));
    expect(idxs.every(i => i >= 0)).toBe(true);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });

  it('collapses and re-expands a category when its header is clicked', () => {
    const { container } = render(<AnimateGrid effect="" onSelect={() => {}} />);
    expect(has(container, 'fire')).toBe(true); // organic, expanded by default
    const header = screen.getByRole('button', { name: /lighting\.category\.organic/ });
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(has(container, 'fire')).toBe(false);
    fireEvent.click(header);
    expect(has(container, 'fire')).toBe(true);
  });
});
