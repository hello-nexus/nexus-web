import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiFlexLcdThemesSection } from './LianLiFlexLcdThemesSection';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiFlexLcd: (...args: any[]) => mockGet(...args),
  setLianLiFlexLcd: (...args: any[]) => mockSet(...args),
}));

const themes = Array.from({ length: 29 }, (_, index) => ({
  index,
  colorCount: index === 13 ? 0 : index === 20 ? 3 : index === 3 ? 4 : 5,
  defaults: ['#A932FF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
}));

const chain = (over: Record<string, unknown> = {}) => ({
  mac: '6D1007F517E1',
  family: 'tlFlex',
  fanCount: 1,
  enabled: false,
  brightness: 60,
  rotation: 3,
  fans: [{ theme: 0, source: 0, colors: null }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
  mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [chain()] });
});

async function renderSection() {
  await act(async () => { render(<LianLiFlexLcdThemesSection />); });
}

describe('LianLiFlexLcdThemesSection', () => {
  it('renders nothing without an LCD Flex chain', async () => {
    mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [] });
    await renderSection();
    expect(screen.queryByText(/flexLcd.title/)).not.toBeInTheDocument();
  });

  it('shows only the switch while the chain is off, and saves it', async () => {
    await renderSection();
    expect(screen.getByText('devices.lianli-wireless.flexLcd.enable')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.aioScreen.theme')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(mockSet).toHaveBeenCalledWith('6D1007F517E1', { enabled: true });
  });

  it('offers a theme per index, the readings the service fills, and one picker per editable color', async () => {
    mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [chain({ enabled: true })] });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.theme' }));
    expect(screen.getAllByRole('option')).toHaveLength(29);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByText('devices.lianli-wireless.flexLcd.graphColor')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.flexLcd.graphColor2')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.aioScreen.unitColor')).toBeInTheDocument();
  });

  it('sends the theme choice and a data source as patches for that fan', async () => {
    mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [chain({ enabled: true })] });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.aioScreen.theme' }));
    await act(async () => { fireEvent.click(screen.getAllByRole('option')[13]); });
    expect(mockSet).toHaveBeenCalledWith('6D1007F517E1', { fans: [{ index: 0, theme: 13 }] });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.flexLcd.source' }));
    await act(async () => { fireEvent.click(screen.getAllByRole('option')[5]); });
    expect(mockSet).toHaveBeenCalledWith('6D1007F517E1', { fans: [{ index: 0, source: 8 }] });
  });

  it('hides the color pickers for a theme with no editable colors', async () => {
    mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [chain({ enabled: true, fans: [{ theme: 13, source: 0, colors: null }] })] });
    await renderSection();
    expect(screen.queryByText('devices.lianli-wireless.aioScreen.labelColor')).not.toBeInTheDocument();
  });

  it('reloads what the service holds when a save is refused', async () => {
    mockSet.mockResolvedValue(false);
    await renderSection();
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('keeps a saved source it does not offer under its number', async () => {
    mockGet.mockResolvedValue({ sourceCount: 25, themes, chains: [chain({ enabled: true, fans: [{ theme: 0, source: 7, colors: null }] })] });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.flexLcd.source' }));
    expect(screen.getByRole('option', { name: '#7' })).toBeInTheDocument();
  });

  it('reads the list again when the chains on the radio change', async () => {
    const view = await act(async () => render(<LianLiFlexLcdThemesSection reloadKey="a" />));
    expect(mockGet).toHaveBeenCalledTimes(1);
    await act(async () => { view.rerender(<LianLiFlexLcdThemesSection reloadKey="b" />); });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
