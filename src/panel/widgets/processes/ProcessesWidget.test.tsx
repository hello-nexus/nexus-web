import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { PanelWidget } from '../../types';
import type { ProcessRow } from './processesData';

const pingMock = vi.fn<() => Promise<{ platform: string } | null>>();
vi.mock('../../../api/service', () => ({
  pingService: () => pingMock(),
}));

// The icon endpoint is a fetch per name; the rows' identity is what matters
// here, so every row renders ProcessIcon's dot.
vi.mock('../../../hooks/useProcessIcon', () => ({ useProcessIcon: () => null }));

// Returns a STABLE array reference, matching the live hook, which holds its
// rows in state: a fresh array every render would defeat the sort memo.
let currentRows: ProcessRow[] = [];
const rowsMock = () => currentRows;
const refreshSeen = vi.fn<(frames: number) => void>();
vi.mock('./useProcessRows', () => ({
  useProcessRows: (refreshFrames: number) => {
    refreshSeen(refreshFrames);
    return rowsMock();
  },
}));

import { ProcessesWidget } from './ProcessesWidget';

function widget(config: Record<string, unknown> = {}): PanelWidget {
  return { id: 'w1', type: 'processes', size: '4x4', slot: 0, config } as unknown as PanelWidget;
}

function rows(): ProcessRow[] {
  return [
    { name: 'zebra',  cpu: 1.0,  memMb: 100,  gpu: 30 },
    { name: 'chrome', cpu: 40.0, memMb: 2048, gpu: 5 },
    { name: 'alpha',  cpu: 12.0, memMb: 4096, gpu: 0 },
  ];
}

// No i18n resources are loaded under vitest, so t() returns the raw key and
// the headers render as their key strings - matched by key below.
const KEY = {
  name: /col\.name/, cpu: /col\.cpu/, ram: /col\.ram/, gpu: /col\.gpu/,
};

/** Renders and flushes the platform ping, whose resolution flips the GPU
 *  column on - leaving it unflushed makes every test log an act() warning. */
async function renderWidget(w: PanelWidget = widget()) {
  render(<ProcessesWidget widget={w} />);
  await act(async () => {});
}

/** Process names in rendered order, header row excluded. */
function renderedNames(): string[] {
  const group = screen.getByRole('rowgroup');
  return within(group).getAllByRole('row').map(r => within(r).getAllByRole('cell')[0].textContent ?? '');
}

describe('ProcessesWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pingMock.mockResolvedValue({ platform: 'darwin' });
    currentRows = rows();
  });

  it('renders one row per process with CPU and RAM', async () => {
    await renderWidget();

    expect(renderedNames()).toHaveLength(3);
    const group = screen.getByRole('rowgroup');
    const chrome = within(group).getAllByRole('row')
      .find(r => within(r).getAllByRole('cell')[0].textContent === 'chrome')!;
    // name, CPU, RAM - no GPU column on a non-Windows platform.
    expect(within(chrome).getAllByRole('cell').map(c => c.textContent))
      .toEqual(['chrome', '40.0%', '2.0 GB']);
  });

  it('hides the GPU column where no per-process GPU source exists', async () => {
    await renderWidget();
    expect(pingMock).toHaveBeenCalled();
    expect(screen.queryByRole('columnheader', { name: KEY.gpu })).toBeNull();
    const group = screen.getByRole('rowgroup');
    expect(within(within(group).getAllByRole('row')[0]).getAllByRole('cell')).toHaveLength(3);
  });

  it('shows the GPU column on Windows', async () => {
    pingMock.mockResolvedValue({ platform: 'windows' });
    await renderWidget();
    expect(screen.getByRole('columnheader', { name: KEY.gpu })).toBeTruthy();
    const group = screen.getByRole('rowgroup');
    const zebra = within(group).getAllByRole('row')
      .find(r => within(r).getAllByRole('cell')[0].textContent === 'zebra')!;
    // GPU sits between CPU and RAM.
    expect(within(zebra).getAllByRole('cell').map(c => c.textContent))
      .toEqual(['zebra', '1.0%', '30.0%', '100 MB']);
  });

  it('sorts by CPU descending before any header is pressed', async () => {
    await renderWidget();
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);
  });

  it('re-sorts alphabetically when the name header is pressed', async () => {
    await renderWidget();
    fireEvent.click(screen.getByRole('button', { name: KEY.name }));
    expect(renderedNames()).toEqual(['alpha', 'chrome', 'zebra']);
  });

  it('sorts by RAM when the RAM header is pressed', async () => {
    await renderWidget();
    fireEvent.click(screen.getByRole('button', { name: KEY.ram }));
    expect(renderedNames()).toEqual(['alpha', 'chrome', 'zebra']);
  });

  it('flips direction when the already-active header is pressed again', async () => {
    await renderWidget();
    fireEvent.click(screen.getByRole('button', { name: KEY.cpu }));
    expect(renderedNames()).toEqual(['zebra', 'alpha', 'chrome']);
    expect(screen.getByRole('columnheader', { name: KEY.cpu })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByRole('button', { name: KEY.cpu }));
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);
    expect(screen.getByRole('columnheader', { name: KEY.cpu })).toHaveAttribute('aria-sort', 'descending');
  });

  it('starts on the sort saved in the widget config', async () => {
    await renderWidget(widget({ sortColumn: 'ram', sortDirection: 'asc' }));
    expect(renderedNames()).toEqual(['zebra', 'chrome', 'alpha']);
    expect(screen.getByRole('columnheader', { name: KEY.ram })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('falls back to CPU descending for an unknown saved column', async () => {
    await renderWidget(widget({ sortColumn: 'io', sortDirection: 'sideways' }));
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);
  });

  it('reads a saved GPU sort as the default wherever the GPU column is hidden', async () => {
    await renderWidget(widget({ sortColumn: 'gpu' }));
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);
    expect(screen.getByRole('columnheader', { name: KEY.cpu })).toHaveAttribute('aria-sort', 'descending');
  });

  it('persists a header press through onUpdate', async () => {
    const onUpdate = vi.fn();
    render(<ProcessesWidget widget={widget()} onUpdate={onUpdate} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: KEY.ram }));
    expect(onUpdate).toHaveBeenLastCalledWith({ sortColumn: 'ram', sortDirection: 'desc' });

    fireEvent.click(screen.getByRole('button', { name: KEY.ram }));
    expect(onUpdate).toHaveBeenLastCalledWith({ sortColumn: 'ram', sortDirection: 'asc' });
  });

  it('follows a sort change that arrives through the config while mounted', async () => {
    // The tile stays mounted under the immersive overlay, so a press in the
    // immersive list reaches it only through the persisted config.
    const { rerender } = render(<ProcessesWidget widget={widget()} />);
    await act(async () => {});
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);

    await act(async () => { rerender(<ProcessesWidget widget={widget({ sortColumn: 'name' })} />); });
    expect(renderedNames()).toEqual(['alpha', 'chrome', 'zebra']);
  });

  it('passes the configured refresh interval through as a frame count', async () => {
    await renderWidget(widget({ refreshSeconds: 4 }));
    expect(refreshSeen).toHaveBeenCalledWith(4);
  });

  it('falls back to a 1-frame refresh for a config value outside the offered set', async () => {
    await renderWidget(widget({ refreshSeconds: 90 }));
    expect(refreshSeen).toHaveBeenCalledWith(1);
  });

  it('lets a spiking process rise into a clipped tile as values change', async () => {
    // The Monitoring page's updateRanking deliberately holds an existing row's
    // position through a value change. On a tile that clips to the rows that
    // fit, that would freeze the visible top-N at whatever it was on mount, so
    // this list re-sorts every frame instead.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(70);
    const { rerender } = render(<ProcessesWidget widget={widget()} />);
    await act(async () => {});
    expect(renderedNames()).toEqual(['chrome', 'alpha']);

    currentRows = [
      { name: 'zebra',  cpu: 99.0, memMb: 100,  gpu: 30 },
      { name: 'chrome', cpu: 40.0, memMb: 2048, gpu: 5 },
      { name: 'alpha',  cpu: 12.0, memMb: 4096, gpu: 0 },
    ];
    await act(async () => { rerender(<ProcessesWidget widget={widget()} />); });
    expect(renderedNames()).toEqual(['zebra', 'chrome']);
  });

  it('caps the tile at the rows that fit whole, and never scrolls', async () => {
    // 3 rows at 26px each need 78px; a 70px viewport fits exactly two.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(70);
    await renderWidget();
    expect(renderedNames()).toEqual(['chrome', 'alpha']);
  });

  it('shows every row in the immersive view, which is the surface that scrolls', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(70);
    render(<ProcessesWidget widget={widget()} immersive />);
    await act(async () => {});
    expect(renderedNames()).toEqual(['chrome', 'alpha', 'zebra']);
  });

  it('shows a centred empty state with no column headings when no process is reported', async () => {
    currentRows = [];
    await renderWidget();
    expect(screen.getByText('panel.processes.empty')).toBeTruthy();
    expect(screen.queryByRole('rowgroup')).toBeNull();
    // The headings are dropped entirely: leaving them up over nothing is what
    // made the widget read as left-weighted.
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
