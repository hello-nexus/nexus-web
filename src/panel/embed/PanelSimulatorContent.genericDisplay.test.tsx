import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  surface: 'monitor',
  activePageId: 'p0',
  pages: [{ id: 'p0', widgets: [clock('a')] }, { id: 'p1', widgets: [clock('b')] }],
};

function mountWith(genericDisplay: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: vi.fn() } as unknown as Window);
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelSimulatorContent />
    </UiSettingsProvider>,
  );
  const message: SimulatorParentToChild = {
    type: 'simulator/init',
    surface: 'monitor',
    deviceTouch: true,
    displayBound: true,
    genericDisplay,
    layout: LAYOUT,
    theme: buildPanelTheme(null, null),
    themeMode: 'dark',
    selectedWidgetId: null,
    brightness: 100,
    screenOn: true,
    showPanel: true,
  };
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin }));
  });
}

const pageCount = () => document.querySelectorAll('[data-panel-page-index]').length;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelSimulatorContent display classification', () => {
  it('renders one page for a generic display', () => {
    mountWith(true);
    expect(pageCount()).toBe(1);
  });

  it('keeps every page for a known device such as a Xeneon Edge', () => {
    mountWith(false);
    expect(pageCount()).toBe(2);
  });
});
