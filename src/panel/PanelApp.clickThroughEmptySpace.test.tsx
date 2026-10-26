import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from './types';

// A generic display's empty space never opens panel UI; the widget menu reaches the panel menu.

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

import PanelApp from './PanelApp';
import { UiSettingsProvider } from '../hooks/useUiSettings';

const layout: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [{ id: 'p0', widgets: [{ id: 'w1', type: 'clock', size: '2x2', col: 0, row: 0, config: {} }] }],
};

const recordWith = (extra: Record<string, unknown>) => ({
  id: 'disp-rec',
  displayName: 'DEL A0B8',
  firstSeenAt: 0,
  lastSeenAt: 0,
  displayId: 'disp1',
  backdrop: 'desktop',
  layout,
  capabilities: { surface: 'monitor', touch: false, orientation: 'Landscape', dpi: 94, cssWidth: 1920, cssHeight: 1200, dpr: 1 },
  ...extra,
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

async function mount(extra: Record<string, unknown>) {
  const record = recordWith(extra);
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

const tray = () => document.querySelector<HTMLElement>('aside[aria-label="panel.actions.label"]');
const widget = () => document.querySelector<HTMLElement>('[data-panel-widget-id="w1"]')!;
const emptySpace = () => document.querySelector<HTMLElement>('[data-panel-page-index]')!;

async function rightClickWidgetThenEmptySpace() {
  fireEvent.contextMenu(widget());
  await screen.findByRole('button', { name: 'panel.widget.menu.remove', hidden: true });
  fireEvent.pointerDown(emptySpace(), { button: 2 });
  fireEvent.contextMenu(emptySpace());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset().mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(1920, 1200);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp empty space on a generic display', () => {
  it('opens the panel menu from empty space on a known display that takes empty space', async () => {
    await mount({ clickThrough: false, alwaysOnTop: false, capabilities: { ...recordWith({}).capabilities, family: 'xeneon-edge' } });
    expect(tray()?.dataset.state).toBe('closed');

    fireEvent.contextMenu(emptySpace());

    await waitFor(() => expect(tray()?.dataset.state).toBe('open'));
  });

  it('only dismisses the widget menu when empty space is right-clicked, whatever click-through is stored', async () => {
    await mount({ clickThrough: false, alwaysOnTop: false });

    await rightClickWidgetThenEmptySpace();

    expect(tray()?.dataset.state).not.toBe('open');
    expect(screen.queryByRole('button', { name: 'panel.widget.menu.remove', hidden: true })).toBeNull();
  });

  it('never opens the panel menu from empty space on a solid background either', async () => {
    await mount({ backdrop: 'theme' });

    fireEvent.contextMenu(emptySpace());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(tray()?.dataset.state).not.toBe('open');
  });

  it('reaches the panel menu from the widget menu', async () => {
    await mount({ backdrop: 'theme' });

    fireEvent.contextMenu(widget());
    fireEvent.click(await screen.findByRole('button', { name: 'panel.actions.label', hidden: true }));

    await waitFor(() => expect(tray()?.dataset.state).toBe('open'));
  });
});
