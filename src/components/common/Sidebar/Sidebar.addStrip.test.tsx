import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { ServiceState } from '../../../hooks/useServiceState';

const SERVICE_STATE: ServiceState = { cooling: null, lighting: null, panel: null };
const ITEMS = [{ key: 'monitoring', label: 'Monitoring', icon: null }];

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <Sidebar
      items={ITEMS}
      active="monitoring"
      onChange={vi.fn()}
      sectionLabel="Apps"
      serviceState={SERVICE_STATE}
      {...props}
    />,
  );
}

describe('Sidebar add-app strip', () => {
  it('is absent without addItem', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Add app' })).not.toBeInTheDocument();
  });

  it('fires addItem.onClick when clicked', () => {
    const onClick = vi.fn();
    renderSidebar({ addItem: { label: 'Add app', onClick } });
    fireEvent.click(screen.getByRole('button', { name: 'Add app' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // The sortable branch renders its own tail; the strip has to close both.
  it('renders in the sortable tail too', () => {
    renderSidebar({ addItem: { label: 'Add app', onClick: vi.fn() }, onTailReorder: vi.fn() });
    expect(screen.getByRole('button', { name: 'Add app' })).toBeInTheDocument();
  });
});
