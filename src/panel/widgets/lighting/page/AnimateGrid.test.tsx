import { render } from '@testing-library/react';
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
