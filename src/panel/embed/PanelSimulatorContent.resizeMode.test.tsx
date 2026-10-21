import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../types';
import type { SimulatorParentToChild } from './simulatorProtocol';

vi.mock('../../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: () => {},
}));

import { PanelSimulatorContent } from './PanelSimulatorContent';
import { UiSettingsProvider } from '../../hooks/useUiSettings';
import { buildPanelTheme } from '../theme/panelTheme';


const tileOf = (id: string, type: string, col: number, row: number): PanelWidget => ({ id, type, size: '4x2', col, row, config: {} });
const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  activePageId: 'p0',
  pages: [{ id: 'p0', widgets: [tileOf('a', 'cooling', 0, 0), tileOf('b', 'clock', 0, 2)] }],
};

function send(message: SimulatorParentToChild) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin }));
  });
}

const cell = (id: string) => document.querySelector<HTMLElement>(`[data-panel-widget-id="${id}"]`)!;
const frame = () => document.querySelector('[data-freeform-frame]');
const menuItem = () => screen.queryByText('panel.widget.menu.resize');

async function enterResizeMode(id: string) {
  fireEvent.contextMenu(cell(id), { clientX: 40, clientY: 40 });
  fireEvent.click(await screen.findByText('panel.widget.menu.resize'));
  await waitFor(() => expect(frame()).not.toBeNull());
  await waitFor(() => expect(menuItem()).toBeNull());
}

// jsdom has no PointerEvent, so coordinates and pointer type would be dropped from every fired event.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: vi.fn() } as unknown as Window);
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelSimulatorContent />
    </UiSettingsProvider>,
  );
  send({
    type: 'simulator/init',
    surface: 'y70',
    deviceTouch: true,
    layout: LAYOUT,
    theme: buildPanelTheme(null, null),
    themeMode: 'dark',
    selectedWidgetId: null,
    brightness: 100,
    screenOn: true,
    showPanel: true,
  });
});

afterEach(() => {
  cleanup();
  // An outside press leaves a one-shot click guard on the document until the next press or key.
  for (const type of ['pointercancel', 'pointerdown', 'keydown']) document.dispatchEvent(new Event(type));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resize mode on the resized tile', () => {
  it('opens no widget menu on a contextmenu', async () => {
    await enterResizeMode('a');
    fireEvent.contextMenu(cell('a'), { clientX: 40, clientY: 40 });
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    expect(menuItem()).toBeNull();
    expect(frame()).not.toBeNull();
  });

  it('treats presses on the resized tile as its own and a press elsewhere as outside', async () => {
    await enterResizeMode('a');
    fireEvent.pointerDown(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    expect(frame()).not.toBeNull();
    fireEvent.pointerDown(cell('b'), { pointerId: 2, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 400 });
    await waitFor(() => expect(frame()).toBeNull());
  });

  it('a tap on the tile exits without firing a click inside it', async () => {
    await enterResizeMode('a');
    const inner = cell('a').querySelector('button, [role="button"], div')!;
    const clicked = vi.fn();
    cell('a').addEventListener('click', clicked);
    fireEvent.pointerDown(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    fireEvent.click(inner, { detail: 1 });
    expect(clicked).not.toHaveBeenCalled();
    await waitFor(() => expect(frame()).toBeNull());
  });

  it('lets a keyboard click through to a control and keeps the mode', async () => {
    await enterResizeMode('a');
    const inner = cell('a').querySelector('button, [role="button"], div')!;
    const clicked = vi.fn();
    cell('a').addEventListener('click', clicked);
    fireEvent.pointerDown(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.click(inner, { detail: 0 });
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(frame()).not.toBeNull();
  });

  it('hides the frame while a drag of the tile is active, on the regular drag path', async () => {
    // jsdom has no layout; the regular drag snapshots the tile's offset size on start.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(150);
    await enterResizeMode('a');
    fireEvent.pointerDown(cell('a'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(document, { pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: 40, clientY: 120 });
    fireEvent.pointerMove(document, { pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: 40, clientY: 200 });
    await waitFor(() => expect(document.querySelectorAll('[data-panel-empty-cell-id]').length).toBeGreaterThan(0));
    expect(frame()).toBeNull();
  });
});
