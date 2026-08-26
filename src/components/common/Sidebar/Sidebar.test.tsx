import { render, screen } from '@testing-library/react';
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
