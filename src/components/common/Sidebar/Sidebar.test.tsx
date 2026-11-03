import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { ServiceState } from '../../../hooks/useServiceState';

const activeLighting: ServiceState = {
  cooling: null,
  lighting: { effect: 'animate', running: true, rgbRunning: true, gpuAvailable: true, scanning: false },
  panel: null,
};
const serviceState: ServiceState = { cooling: null, lighting: null, panel: null };

describe('Sidebar', () => {
  it('slides a docked row in and shines it once per announcement, then reports the shine done', () => {
    const onArrivalDone = vi.fn();
    const items = [
      { key: 'lighting', label: 'Lighting', icon: <span /> },
      { key: 'app:fish', label: 'Fish', icon: <span /> },
    ];
    const { container, rerender } = render(
      <Sidebar
        items={items}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={serviceState}
        arrival={{ key: 'app:fish', enter: true, shines: 2, nonce: 1 }}
        onArrivalDone={onArrivalDone}
      />,
    );

    const fish = container.querySelector('[data-sidebar-row-key="app:fish"]') as HTMLElement;
    const lighting = container.querySelector('[data-sidebar-row-key="lighting"]') as HTMLElement;
    const shine = fish.querySelector('[aria-hidden="true"][style]') as HTMLElement;
    expect(fish.className).toMatch(/itemArriving/);
    expect(fish.closest('[class*="rowShellArriving"]')).not.toBeNull();
    expect(shine.style.animationIterationCount).toBe('2');
    expect(lighting.className).not.toMatch(/itemArriving/);

    // jsdom has no AnimationEvent, so React listens for the prefixed name.
    fireEvent(shine, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(onArrivalDone).toHaveBeenCalledTimes(1);

    rerender(
      <Sidebar
        items={items}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={serviceState}
        arrival={{ key: 'app:fish', enter: false, shines: 1, nonce: 2 }}
        onArrivalDone={onArrivalDone}
      />,
    );
    expect(fish.className).not.toMatch(/itemArriving/);
    expect(fish.querySelector('[aria-hidden="true"][style]')).not.toBe(shine);
  });

  it('renders no disabled glyph for a row without offTooltip', () => {
    render(
      <Sidebar
        items={[{ key: 'lighting', label: 'Lighting', icon: <span /> }]}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={serviceState}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the disabled glyph with the given tooltip when offTooltip is set', () => {
    render(
      <Sidebar
        items={[{ key: 'lighting', label: 'Lighting', icon: <span />, offTooltip: 'Off in Settings' }]}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={serviceState}
      />,
    );

    expect(screen.getByRole('img', { name: 'Off in Settings' })).toBeInTheDocument();
  });

  it('hides the disabled glyph in compact mode', () => {
    render(
      <Sidebar
        items={[{ key: 'lighting', label: 'Lighting', icon: <span />, offTooltip: 'Off in Settings' }]}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={serviceState}
        compact
      />,
    );

    expect(screen.queryByRole('img', { name: 'Off in Settings' })).not.toBeInTheDocument();
  });

  it('shows the activity dot for a live, enabled lighting row', () => {
    render(
      <Sidebar
        items={[{ key: 'lighting', label: 'Lighting', icon: <span /> }]}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={activeLighting}
      />,
    );

    expect(document.querySelector('[class*=statusIndicator]')).not.toBeNull();
  });

  it('suppresses the activity dot in favor of the off-badge when the row is disabled', () => {
    render(
      <Sidebar
        items={[{ key: 'lighting', label: 'Lighting', icon: <span />, offTooltip: 'Off in Settings' }]}
        active="lighting"
        onChange={vi.fn()}
        sectionLabel="Apps"
        serviceState={activeLighting}
      />,
    );

    expect(document.querySelector('[class*=statusIndicator]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Off in Settings' })).toBeInTheDocument();
  });
});
