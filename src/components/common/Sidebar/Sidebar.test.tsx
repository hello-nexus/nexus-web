import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { ServiceState } from '../../../hooks/useServiceState';

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
});
