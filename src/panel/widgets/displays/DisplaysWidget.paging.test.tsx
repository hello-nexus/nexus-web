// A fifth monitor used to be sliced off the list and simply never rendered.
// t() is uninitialised under vitest and returns the raw key.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Display, DisplayListResponse } from '../../../api/displays';
import type { PanelWidget } from '../../types';
import { DisplaysWidget } from './DisplaysWidget';

const fetchDisplays = vi.fn<() => Promise<DisplayListResponse | null>>();

vi.mock('../../../api/displays', () => ({
  fetchDisplays: () => fetchDisplays(),
  fetchDisplayBrightness: () => Promise.resolve(null),
  setDisplayBrightness: () => Promise.resolve(null),
}));

const NEXT = 'displays.panel.next';
const PREV = 'displays.panel.prev';

function display(i: number): Display {
  return {
    id: `d-${i}`,
    name: `Monitor ${i}`,
    manufacturer: 'Acme',
    model: `M${i}`,
    isInternal: false,
    isDdcCapable: true,
    brightnessControl: { supported: true, current: 50, writeMode: 'ddc', controlPath: '', unsupportedReason: '' },
  } as unknown as Display;
}

function renderWith(count: number) {
  fetchDisplays.mockResolvedValue({
    error: false, msg: '', hint: '', displays: Array.from({ length: count }, (_, i) => display(i)),
  } as unknown as DisplayListResponse);
  const widget: PanelWidget = { id: 'd1', type: 'displays', size: '4x2', col: 0, row: 0, config: {} };
  return render(<DisplaysWidget widget={widget} surface="y70" />);
}

beforeEach(() => vi.clearAllMocks());

describe('DisplaysWidget paging', () => {
  it('shows no arrows when every display fits', async () => {
    renderWith(4);
    await waitFor(() => expect(screen.getByText('Monitor 0')).toBeTruthy());
    expect(screen.getByText('Monitor 3')).toBeTruthy();
    expect(screen.queryByLabelText(NEXT)).toBeNull();
    expect(screen.queryByLabelText(PREV)).toBeNull();
  });

  it('pages rather than dropping displays past the fourth', async () => {
    renderWith(6);
    await waitFor(() => expect(screen.getByText('Monitor 0')).toBeTruthy());
    expect(screen.queryByText('Monitor 4')).toBeNull();

    fireEvent.click(screen.getByLabelText(NEXT));
    expect(screen.getByText('Monitor 4')).toBeTruthy();
    expect(screen.getByText('Monitor 5')).toBeTruthy();
  });
});
