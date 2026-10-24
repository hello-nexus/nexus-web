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

describe('AnimateGrid gpuAvailable=false', () => {
  it('renders all effect cells without error when gpu is unavailable', () => {
    const { container } = render(
      <AnimateGrid effect="plasma" onSelect={() => {}} gpuAvailable={false} />,
    );
    expect(container.querySelectorAll('[data-effect-key]').length).toBeGreaterThan(0);
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

  it('orders sections simple, organic, pattern, then the rest with audio last', () => {
    const { container } = render(<AnimateGrid effect="" onSelect={() => {}} />);
    const text = container.textContent || '';
    const order = ['simple', 'organic', 'pattern', 'cosmic', 'geometric', 'audio'];
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

describe('AnimateGrid search', () => {
  const keys = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-effect-key]')].map(el => el.getAttribute('data-effect-key'));

  it('shows only effects whose name matches every word', () => {
    const { container } = render(<AnimateGrid effect="plasma" onSelect={() => {}} query="plasma" />);
    const shown = keys(container);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every(k => k?.includes('plasma'))).toBe(true);
  });

  it('treats a whitespace-only query as no search', () => {
    const all = keys(render(<AnimateGrid effect="plasma" onSelect={() => {}} />).container);
    const spaced = keys(render(<AnimateGrid effect="plasma" onSelect={() => {}} query="   " />).container);
    expect(spaced).toEqual(all);
    expect(screen.queryByText('lighting.effects.noMatches')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    const { container } = render(<AnimateGrid effect="plasma" onSelect={() => {}} query="zzzz-no-such-effect" />);
    expect(keys(container)).toEqual([]);
    expect(screen.getByText('lighting.effects.noMatches')).toBeInTheDocument();
  });

  it('keeps the hint away when the leading saved effects match', () => {
    render(<AnimateGrid effect="plasma" onSelect={() => {}} query="zzzz-no-such-effect" leading={<span>Mine</span>} leadingMatches />);
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('lighting.effects.noMatches')).not.toBeInTheDocument();
  });
});

describe('AnimateGrid pin badge', () => {
  const grid = (pinnedDevices?: Map<string, string[]>) => render(
    <AnimateGrid
      effect="plasma"
      onSelect={() => {}}
      slotFor={() => 0}
      versionFor={() => '0'}
      pinnedDevices={pinnedDevices}
    />,
  );

  it('badges exactly the effects with a pinned device, showing the count', () => {
    const { container } = grid(new Map([['plasma', ['Fan 1', 'Strip']]]));
    const badges = screen.getAllByTestId('effect-pin-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('2');
    expect(badges[0].closest('[data-effect-key]')?.getAttribute('data-effect-key')).toBe('plasma');
    expect(container.querySelectorAll('svg.lucide-pin').length).toBe(0);
  });

  it('shows no count when nothing is pinned', () => {
    grid(new Map());
    expect(screen.queryByTestId('effect-pin-badge')).toBeNull();
  });

  it('lists the device names in the tooltip on hover', async () => {
    grid(new Map([['plasma', ['Fan 1', 'Strip']]]));
    fireEvent.pointerEnter(screen.getByTestId('effect-pin-badge'));
    expect(await screen.findByText('Fan 1')).toBeTruthy();
    expect(screen.getByText('Strip')).toBeTruthy();
  });

  it('keeps the usage icons beside the count', () => {
    const { container } = render(
      <AnimateGrid
        effect="plasma" onSelect={() => {}} slotFor={() => 0} versionFor={() => '0'}
        rgbActiveEffect="plasma" pinnedDevices={new Map([['plasma', ['Fan 1']]])}
      />,
    );
    expect(container.querySelectorAll('svg.lucide-lightbulb').length).toBe(1);
    expect(screen.getByTestId('effect-pin-badge').textContent).toBe('1');
  });
});

describe('AnimateGrid edit pencil', () => {
  const renderGrid = (props: { effect: string; onEdit?: () => void; editEnabled?: boolean; onSelect?: (k: string) => void }) => render(
    <AnimateGrid
      effect={props.effect}
      onSelect={props.onSelect ?? (() => {})}
      onEdit={props.onEdit}
      editEnabled={props.editEnabled ?? !!props.onEdit}
      slotFor={() => 0}
      versionFor={() => '0'}
    />,
  );

  it('shows the pencil only on the selected tile while the editor is closed', () => {
    const { container } = renderGrid({ effect: 'plasma', onEdit: () => {} });
    const pencils = container.querySelectorAll('[data-edit-hint-overlay]');
    expect(pencils.length).toBe(1);
    expect(pencils[0].closest('[data-effect-key]')?.getAttribute('data-effect-key')).toBe('plasma');
    expect(pencils[0].getAttribute('aria-hidden')).toBe('true');
    expect(pencils[0].textContent).toBe('');
  });

  it('shows no pencil and re-picks when edit is not enabled', () => {
    const onEdit = vi.fn();
    const onSelect = vi.fn();
    const { container } = renderGrid({ effect: 'plasma', onEdit, editEnabled: false, onSelect });
    expect(container.querySelectorAll('[data-edit-hint-overlay]').length).toBe(0);
    fireEvent.click(container.querySelector('[data-effect-key="plasma"]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('keeps the same tile elements when edit toggles, so focus survives', () => {
    const onEdit = vi.fn();
    const { container, rerender } = renderGrid({ effect: 'plasma', onEdit, editEnabled: true });
    const tile = container.querySelector('[data-effect-key="plasma"]')!;
    rerender(<AnimateGrid effect="plasma" onSelect={() => {}} onEdit={onEdit} editEnabled={false} slotFor={() => 0} versionFor={() => '0'} />);
    expect(container.querySelector('[data-effect-key="plasma"]')).toBe(tile);
  });

  it('re-picks on a touch or coarse pointer', () => {
    const original = window.matchMedia;
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    try {
      const onEdit = vi.fn();
      const onSelect = vi.fn();
      const { container } = renderGrid({ effect: 'plasma', onEdit, onSelect });
      fireEvent.click(container.querySelector('[data-effect-key="plasma"]')!);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onEdit).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });

  it('names the selected tile by its edit action and opens the editor without re-selecting', () => {
    const onEdit = vi.fn();
    const onSelect = vi.fn();
    renderGrid({ effect: 'plasma', onEdit, onSelect });
    fireEvent.click(screen.getByRole('button', { name: /lighting\.effects\.edit/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens the editor when the selected tile itself is clicked', () => {
    const onEdit = vi.fn();
    const onSelect = vi.fn();
    const { container } = renderGrid({ effect: 'plasma', onEdit, onSelect });
    fireEvent.click(container.querySelector('[data-effect-key="plasma"]')!);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the hint on a tile selected under a still pointer, until the pointer leaves', () => {
    const onEdit = vi.fn();
    const { container, rerender } = renderGrid({ effect: 'plasma', onEdit });
    const next = Array.from(container.querySelectorAll('[data-effect-key]')).map(e => e.getAttribute('data-effect-key')!).find(k => k !== 'plasma')!;
    fireEvent.pointerEnter(container.querySelector(`[data-effect-key="${next}"]`)!);
    rerender(<AnimateGrid effect={next} onSelect={() => {}} onEdit={onEdit} editEnabled slotFor={() => 0} versionFor={() => '0'} />);
    const tile = container.querySelector(`[data-effect-key="${next}"]`)!;
    expect(tile.getAttribute('data-edit-hint-shown')).toBe('true');
    fireEvent.pointerLeave(tile);
    expect(tile.hasAttribute('data-edit-hint-shown')).toBe(false);
  });

  it('does not force the hint while edit is not enabled', () => {
    const { container } = renderGrid({ effect: 'plasma', onEdit: () => {}, editEnabled: false });
    fireEvent.pointerEnter(container.querySelector('[data-effect-key="plasma"]')!);
    expect(container.querySelector('[data-edit-hint-shown]')).toBeNull();
  });

  it('selects, not edits, when a different tile is clicked', () => {
    const onEdit = vi.fn();
    const onSelect = vi.fn();
    const { container } = renderGrid({ effect: 'plasma', onEdit, onSelect });
    const other = Array.from(container.querySelectorAll('[data-effect-key]')).find(el => el.getAttribute('data-effect-key') !== 'plasma')!;
    fireEvent.click(other);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('puts the pencil on a tile the moment it becomes selected, with no re-hover', () => {
    const onEdit = vi.fn();
    const { container, rerender } = renderGrid({ effect: 'plasma', onEdit });
    const next = Array.from(container.querySelectorAll('[data-effect-key]')).map(el => el.getAttribute('data-effect-key')!).find(k => k !== 'plasma')!;
    rerender(<AnimateGrid effect={next} onSelect={() => {}} onEdit={onEdit} editEnabled slotFor={() => 0} versionFor={() => '0'} />);
    const pencils = container.querySelectorAll('[data-edit-hint-overlay]');
    expect(pencils.length).toBe(1);
    expect(pencils[0].closest('[data-effect-key]')?.getAttribute('data-effect-key')).toBe(next);
  });
});
