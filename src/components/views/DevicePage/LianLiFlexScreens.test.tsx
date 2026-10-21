import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';
import type { LianLiScreenApi, LianLiWirelessScreen } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGetMedia = vi.fn();
vi.mock('../../../api/lianli-wireless', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-wireless')>()),
  getLianLiWirelessMedia: (...a: any[]) => mockGetMedia(...a),
  getLianLiAioScreen: () => Promise.resolve(null),
}));

const screen1: LianLiWirelessScreen = {
  serial: 'S1', position: -1, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off', label: 'TL Flex',
};
const screen2: LianLiWirelessScreen = { ...screen1, serial: 'S2', label: 'SL-INF Flex' };

const mockGetScreens = vi.fn();
const api: LianLiScreenApi = {
  getScreens: (...a) => mockGetScreens(...a),
  setSettings: () => Promise.resolve(true),
  setOrder: () => Promise.resolve(true),
  setContent: () => Promise.resolve(true),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMedia.mockResolvedValue([]);
});

describe('Flex screens tile names and order', () => {
  it('names tiles from the page labels when the service sends none and lists them in the page order', async () => {
    mockGetScreens.mockResolvedValue([{ ...screen1, label: '' }, { ...screen2, label: '' }]);
    await act(async () => {
      render(<LianLiWirelessScreenTab api={api} screenLabels={{ S1: 'SL-INF Flex', S2: 'TL Flex' }} defaultOrder={['S2', 'S1']} />);
    });
    const tiles = within(screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' })).getAllByRole('button');
    expect(tiles.map(b => b.textContent)).toEqual(['TL Flex', 'SL-INF Flex']);
  });

  it('shows the service label over the page label so two screens of a family stay distinct', async () => {
    mockGetScreens.mockResolvedValue([{ ...screen1, label: 'TL Flex 1' }, { ...screen2, label: 'TL Flex 2' }]);
    await act(async () => {
      render(<LianLiWirelessScreenTab api={api} screenLabels={{ S1: 'TL Flex', S2: 'TL Flex' }} />);
    });
    const tiles = within(screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' })).getAllByRole('button');
    expect(tiles.map(b => b.textContent)).toEqual(['TL Flex 1', 'TL Flex 2']);
  });

  it('keeps a saved order over the page order', async () => {
    mockGetScreens.mockResolvedValue([{ ...screen1, order: 0 }, { ...screen2, order: 1 }]);
    await act(async () => {
      render(<LianLiWirelessScreenTab api={api} defaultOrder={['S2', 'S1']} />);
    });
    const tiles = within(screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' })).getAllByRole('button');
    expect(tiles[0].textContent).toContain('TL Flex');
  });
});

describe('Flex screens media names', () => {
  it('shows the stored media names as they are', async () => {
    mockGetMedia.mockResolvedValue([{ id: 'm1', name: 'vid.mp4', kind: 'video' }]);
    mockGetScreens.mockResolvedValue([screen1]);
    await act(async () => { render(<LianLiWirelessScreenTab api={api} />); });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli-wireless.contentTypeMedia' })); });
    expect(screen.getByText('vid.mp4').className).toMatch(/labelAsIs/);
  });
});
