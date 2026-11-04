import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from './types';

// An incoming pairing request shows as the shared modal on a touch panel, and never in restricted mode.

const fetchMock = vi.fn();
const patchMock = vi.fn();
const patchCapsMock = vi.fn();

vi.mock('../api/panel', async importOriginal => ({
  ...await importOriginal<typeof import('../api/panel')>(),
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
  patchPanelDeviceWithStatus: (...args: unknown[]) => patchMock(...args),
  patchPanelDevice: (...args: unknown[]) => patchCapsMock(...args),
}));

vi.mock('../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: () => {},
}));

vi.mock('../hooks/useServiceStatus', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useServiceStatus')>(),
  useServiceStatus: () => ({ state: 'online', ping: null }),
}));

vi.mock('./engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
  onLayoutChanged: () => () => {},
}));

const pairHookMock = vi.fn();
vi.mock('../hooks/usePairApprovalRequest', () => ({
  usePairApprovalRequest: (enabled: boolean) => pairHookMock(enabled),
}));

import PanelApp from './PanelApp';
import { UiSettingsProvider } from '../hooks/useUiSettings';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

const layout: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [{ id: 'p0', widgets: [{ id: 'w0', type: 'clock', size: '2x2', col: 0, row: 0, config: {} }] }],
};

const frame = { requestId: 'r1', sas: '482 913', deviceLabel: 'iPhone', remoteAddress: '', userAgent: '', expiresAt: 0, reason: '' };

async function mount(restrictedMode: boolean) {
  const record = {
    id: 'disp-rec',
    displayName: 'Touch bar',
    firstSeenAt: 0,
    lastSeenAt: 0,
    displayId: 'disp1',
    backdrop: 'desktop',
    restrictedMode,
    layout,
    capabilities: { surface: 'monitor', touch: true, orientation: 'Landscape', dpi: 94, cssWidth: 1920, cssHeight: 515, dpr: 1 },
  };
  fetchMock.mockResolvedValue({ found: true, record });
  patchMock.mockResolvedValue({ ok: true, record });
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="disp-rec" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset().mockResolvedValue(null);
  // Mirrors the real hook: a request only surfaces while the panel enables it.
  pairHookMock.mockReset().mockImplementation((enabled: boolean) => ({
    active: enabled ? frame : null, busy: false, error: null, decide: vi.fn(async () => {}),
  }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(1920, 515);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp pairing prompt', () => {
  it('shows the pairing request as a modal alert dialog on a touch panel', async () => {
    await mount(false);

    expect(screen.getByText('482 913')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'phonePair.code.allow' })).toBeInTheDocument();
  });

  it('shows nothing in restricted mode', async () => {
    await mount(true);

    expect(screen.queryByText('482 913')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
