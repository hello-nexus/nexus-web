import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlacialPanelRoute, showsGlacialPanelPage } from './GlacialPanelRoute';
import type { GlacialState } from '../../../api/asus-glacial-lcd';

const mockGet = vi.fn();

vi.mock('../../../api/asus-glacial-lcd', () => ({
  getGlacialState: () => mockGet(),
  GLACIAL_STATE_CHANGED_EVENT: 'nexus:glacial-state-changed',
}));
vi.mock('./AsusGlacialLcdDevicePage', () => ({ AsusGlacialLcdDevicePage: () => <div>native-page</div> }));
vi.mock('./PanelDevicePage', () => ({ PanelDevicePage: () => <div>panel-page</div> }));

const state = (over: Partial<GlacialState>) => ({ mode: 'panel', modeChosen: true, panelModeAvailable: true, ...over }) as GlacialState;

describe('showsGlacialPanelPage', () => {
  it('needs the capability, a chosen mode and panel mode', () => {
    expect(showsGlacialPanelPage(state({}))).toBe(true);
    expect(showsGlacialPanelPage(state({ panelModeAvailable: false }))).toBe(false);
    expect(showsGlacialPanelPage(state({ panelModeAvailable: undefined }))).toBe(false);
    expect(showsGlacialPanelPage(state({ mode: 'animated' }))).toBe(false);
    expect(showsGlacialPanelPage(state({ modeChosen: false }))).toBe(false);
    expect(showsGlacialPanelPage(null)).toBe(false);
  });
});

describe('GlacialPanelRoute', () => {
  beforeEach(() => mockGet.mockReset());

  async function mount() {
    await act(async () => {
      render(<GlacialPanelRoute device={{} as never} />);
    });
  }

  it('shows the native page when the capability is off, even for a stale panel record', async () => {
    mockGet.mockResolvedValue(state({ panelModeAvailable: false }));
    await mount();
    expect(screen.getByText('native-page')).toBeInTheDocument();
    expect(screen.queryByText('panel-page')).toBeNull();
  });

  it('shows the native page in a native mode even when panel mode is offered', async () => {
    mockGet.mockResolvedValue(state({ mode: 'animated' }));
    await mount();
    expect(screen.getByText('native-page')).toBeInTheDocument();
  });

  it('shows the panel page in panel mode when offered', async () => {
    mockGet.mockResolvedValue(state({}));
    await mount();
    expect(screen.getByText('panel-page')).toBeInTheDocument();
  });
});
