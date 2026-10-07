import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../types';
import type { SimulatorParentToChild } from './simulatorProtocol';
import { BLANK_PAGE_ID } from '../engine/panelLayoutOps';

vi.mock('../../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: () => {},
}));

import { PanelSimulatorContent } from './PanelSimulatorContent';
import { UiSettingsProvider } from '../../hooks/useUiSettings';
import { buildPanelTheme } from '../theme/panelTheme';

const clock = (id: string): PanelWidget => ({ id, type: 'clock', size: '4x2', col: 0, row: 0, config: {} });

const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  activePageId: 'p1',
  pages: [{ id: 'p0', widgets: [clock('a')] }, { id: 'p1', widgets: [clock('b')] }],
};

function send(message: SimulatorParentToChild) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin }));
  });
}

const parentPost = vi.fn();

const pages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));
const shownPageId = () => pages().find(p => p.getAttribute('aria-hidden') === 'false')?.dataset.panelPageId;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  parentPost.mockReset();
  vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: parentPost } as unknown as Window);
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const withActive = (activePageId: string, layout: PanelLayout = LAYOUT): PanelLayout => ({ ...layout, activePageId });
const layoutChangedPosts = () => parentPost.mock.calls
  .filter(([m]) => m.type === 'simulator/layout-changed')
  .map(([m]) => (m as { layout: PanelLayout }).layout.activePageId);

describe('PanelSimulatorContent blank page', () => {
  it('renders no blank page while a stored page is shown', () => {
    expect(pages().map(p => p.dataset.panelPageId)).toEqual(['p0', 'p1']);
    expect(shownPageId()).toBe('p1');
  });

  it('follows the stored blank page and back', () => {
    send({ type: 'simulator/set-layout', layout: withActive(BLANK_PAGE_ID) });
    expect(pages()).toHaveLength(3);
    expect(pages()[2].querySelector('[data-panel-widget-id]')).toBeNull();
    expect(shownPageId()).toBe(pages()[2].dataset.panelPageId);

    send({ type: 'simulator/set-layout', layout: withActive('p1') });
    expect(pages()).toHaveLength(2);
    expect(shownPageId()).toBe('p1');
  });

  it('lands on the page an add on the blank page creates', () => {
    send({ type: 'simulator/set-layout', layout: withActive(BLANK_PAGE_ID) });
    send({
      type: 'simulator/set-layout',
      layout: withActive('p2', { ...LAYOUT, pages: [...LAYOUT.pages, { id: 'p2', widgets: [clock('c')] }] }),
    });
    expect(pages().map(p => p.dataset.panelPageId)).toEqual(['p0', 'p1', 'p2']);
    expect(shownPageId()).toBe('p2');
  });

  it('stores the page a swipe off the blank page lands on', () => {
    send({ type: 'simulator/set-layout', layout: withActive(BLANK_PAGE_ID) });
    const at = (clientX: number) => ({ touches: [{ clientX, clientY: 100 }] });
    const blank = pages()[2];
    act(() => {
      fireEvent.touchStart(blank, at(100));
      fireEvent.touchMove(blank, at(200));
      fireEvent.touchMove(blank, at(600));
      fireEvent.touchEnd(blank, { touches: [] });
    });
    expect(shownPageId()).toBe('p1');
    expect(layoutChangedPosts().at(-1)).toBe('p1');
  });

  it('shows the last page for a stored blank page it cannot render', () => {
    send({ type: 'simulator/set-layout', layout: withActive('p0') });
    expect(shownPageId()).toBe('p0');
    // Every widget on the last page filtered out: nothing to add a page after.
    send({
      type: 'simulator/set-layout',
      layout: withActive(BLANK_PAGE_ID, { ...LAYOUT, pages: [LAYOUT.pages[0], { id: 'p1', widgets: [] }] }),
    });
    expect(pages().map(p => p.dataset.panelPageId)).toEqual(['p0', 'p1']);
    expect(shownPageId()).toBe('p1');
  });
});
