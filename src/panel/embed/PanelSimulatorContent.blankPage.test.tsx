import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
const blankPageLeftPosts = () => parentPost.mock.calls.filter(([m]) => m.type === 'simulator/blank-page-left').length;

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

describe('PanelSimulatorContent blank page', () => {
  it('renders no blank page until the device page shows it', () => {
    expect(pages().map(p => p.dataset.panelPageId)).toEqual(['p0', 'p1']);
    expect(shownPageId()).toBe('p1');
  });

  it('steps onto the blank page and back', () => {
    send({ type: 'simulator/set-blank-page', shown: true });
    expect(pages()).toHaveLength(3);
    expect(pages()[2].querySelector('[data-panel-widget-id]')).toBeNull();
    expect(shownPageId()).toBe(pages()[2].dataset.panelPageId);

    send({ type: 'simulator/set-blank-page', shown: false });
    expect(pages()).toHaveLength(2);
    expect(shownPageId()).toBe('p1');
  });

  it('lands on the page an add on the blank page creates', () => {
    send({ type: 'simulator/set-blank-page', shown: true });
    // The device page posts the new layout before clearing the blank page.
    send({
      type: 'simulator/set-layout',
      layout: { ...LAYOUT, activePageId: 'p2', pages: [...LAYOUT.pages, { id: 'p2', widgets: [clock('c')] }] },
    });
    expect(shownPageId()).toBe('p2');
    send({ type: 'simulator/set-blank-page', shown: false });
    expect(pages().map(p => p.dataset.panelPageId)).toEqual(['p0', 'p1', 'p2']);
    expect(shownPageId()).toBe('p2');
  });

  it('tells the device page when a swipe leaves the blank page', () => {
    send({ type: 'simulator/set-blank-page', shown: true });
    const at = (clientX: number) => ({ touches: [{ clientX, clientY: 100 }] });
    const blank = pages()[2];
    act(() => {
      fireEvent.touchStart(blank, at(100));
      fireEvent.touchMove(blank, at(200));
      fireEvent.touchMove(blank, at(600));
      fireEvent.touchEnd(blank, { touches: [] });
    });
    expect(shownPageId()).toBe('p1');
    expect(blankPageLeftPosts()).toBe(1);
  });

  it('tells the device page when it has no blank page to show', () => {
    // Every widget on the last page filtered out: nothing to add a page after.
    send({
      type: 'simulator/set-layout',
      layout: { ...LAYOUT, pages: [LAYOUT.pages[0], { id: 'p1', widgets: [] }] },
    });
    send({ type: 'simulator/set-blank-page', shown: true });
    expect(pages()).toHaveLength(2);
    expect(blankPageLeftPosts()).toBe(1);
  });
});
