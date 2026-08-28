import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { PanelWidget } from '../../types';
import type { ProcessRow } from './processesData';

const pingMock = vi.fn<() => Promise<{ platform: string } | null>>();
vi.mock('../../../api/service', () => ({ pingService: () => pingMock() }));
vi.mock('../../../hooks/useProcessIcon', () => ({ useProcessIcon: () => null }));

let currentRows: ProcessRow[] = [];
vi.mock('./useProcessRows', () => ({ useProcessRows: () => currentRows }));

const frameMock = vi.fn(() => ({
  cpu: { name: 'CPU', sensors: [{ id: 'c', name: 'CPU Total', type: 'Load', value: 42, units: '', formatted: '42' }] },
  gpu: [{ name: 'GPU', sensors: [{ id: 'g', name: 'GPU Core', type: 'Load', value: 71, units: '', formatted: '71' }] }],
  memory: { name: 'RAM', sensors: [{ id: 'm', name: 'Memory Load', type: 'Load', value: 55, units: '', formatted: '55' }] },
}));
vi.mock('../../../lib/monitoringStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/monitoringStore')>();
  return { ...actual, getMonitoringFrame: () => frameMock() };
});

import { ProcessesTouch } from './ProcessesTouch';

function widget(): PanelWidget {
  return { id: 'w1', type: 'processes', size: '4x4', slot: 0, config: {} } as unknown as PanelWidget;
}

async function renderTouch() {
  render(<ProcessesTouch widget={widget()} immersiveGrid={{ columns: 16, rows: 4 }} />);
  await act(async () => {});
}

/** Card headings, in page order. */
function cardLabels(): string[] {
  return [...document.querySelectorAll('[class*="label"]')].map(el => el.textContent ?? '');
}

describe('ProcessesTouch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pingMock.mockResolvedValue({ platform: 'windows' });
    currentRows = [
      { name: 'chrome', cpu: 10, memMb: 2048, gpu: 20, io: 1000 },
      { name: 'code',   cpu: 30, memMb: 512,  gpu: 5,  io: 4000 },
    ];
  });

  it('renders a card per resource, in CPU / GPU / memory / I/O order', async () => {
    await renderTouch();
    expect(cardLabels()).toEqual([
      'panel.processes.col.cpu',
      'panel.processes.col.gpu',
      'panel.processes.resource.memory',
      'panel.processes.resource.io',
    ]);
  });

  it('keeps the raw list off the first page, after the graph cards', async () => {
    // A Y70 landscape grid fits exactly the four cards, so the list - the only
    // cell that renders column headings - sits on the following page.
    await renderTouch();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(cardLabels()).toHaveLength(4);
  });

  it('renders the list on the same page when the grid is tall enough for five cells', async () => {
    render(<ProcessesTouch widget={widget()} immersiveGrid={{ columns: 4, rows: 20 }} />);
    await act(async () => {});
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
  });

  it('gives the list cell the full page height rather than a pinned 4x4', async () => {
    // ImmersiveLayout stamps data-fill on the cell it lets grow. The list is
    // the last cell, so it must be the one that fills - a pinned 4x4 would
    // leave the list a quarter-page tall on its own page.
    render(<ProcessesTouch widget={widget()} immersiveGrid={{ columns: 4, rows: 20 }} />);
    await act(async () => {});
    const filled = document.querySelector('[data-fill="true"]');
    expect(filled).not.toBeNull();
    expect(filled!.querySelector('[role="rowgroup"]')).not.toBeNull();
  });

  it('shows each resource its own system-wide figure', async () => {
    await renderTouch();
    expect(screen.getByText('42.0%')).toBeTruthy();
    expect(screen.getByText('71.0%')).toBeTruthy();
    expect(screen.getByText('55.0%')).toBeTruthy();
    // I/O is the sum of the per-process rates.
    expect(screen.getByText('4.9 KB/s')).toBeTruthy();
  });

  it('renders the GPU card graph-only off Windows, where no per-process GPU exists', async () => {
    pingMock.mockResolvedValue({ platform: 'darwin' });
    await renderTouch();
    const gpuCard = [...document.querySelectorAll('[data-graph-only]')];
    expect(gpuCard.length).toBe(1);
    // The card is still there - only its process list is dropped.
    expect(cardLabels()).toContain('panel.processes.col.gpu');
  });

  it('renders the I/O card graph-only against a service that sends no per-process I/O', async () => {
    currentRows = [{ name: 'chrome', cpu: 10, memMb: 2048, gpu: 20 }];
    await renderTouch();
    expect(document.querySelectorAll('[data-graph-only]').length).toBe(1);
  });
});
