import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelSurface, PanelWidgetSize } from './types';

// The whole path from a tile's opaque report to the background: the gallery
// tile reports through the grid's provider, PanelApp resolves the single
// widget a Kraken shows, and the shader is told it is covered. Only the
// transport and the shader's WebGL are mocked.
const fetchMock = vi.fn();
const shaderCovered: boolean[] = [];

vi.mock('../api/panel', async importOriginal => ({
  ...await importOriginal<typeof import('../api/panel')>(),
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
  patchPanelDeviceWithStatus: vi.fn(async () => ({ ok: true, record: null })),
  patchPanelDevice: vi.fn(async () => null),
}));

vi.mock('../api/gallery', async importOriginal => ({
  ...await importOriginal<typeof import('../api/gallery')>(),
  fetchGalleryItems: vi.fn(async () => ({
    items: [{ id: 'a', name: 'a.jpg', sourceId: 'src-1', kind: 'image' }],
    playlists: [],
  })),
}));

vi.mock('../api/service', async importOriginal => ({
  ...await importOriginal<typeof import('../api/service')>(),
  fetchServiceBlob: vi.fn(async () => new Blob(['img'])),
}));

vi.mock('../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: () => {},
}));

vi.mock('./engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
  onLayoutChanged: () => () => {},
}));

vi.mock('./background/PanelBackgroundShader', () => ({
  PanelBackgroundShader: ({ covered }: { covered?: boolean }) => {
    shaderCovered.push(covered === true);
    return null;
  },
}));

import PanelApp from './PanelApp';
import { UiSettingsProvider } from '../hooks/useUiSettings';

function recordWith(surface: PanelSurface, size: PanelWidgetSize, config: Record<string, unknown> = {}) {
  const layout: PanelLayout = {
    layoutSchemaVersion: 2,
    surface,
    activePageId: 'page-1',
    pages: [{ id: 'page-1', widgets: [{ id: 'w-gallery', type: 'gallery', size, col: 0, row: 0, config }] }],
  };
  return {
    id: 'panel-1',
    displayName: 'Panel',
    firstSeenAt: 0,
    lastSeenAt: 0,
    layout,
    capabilities: { surface, touch: false, dpi: 100, cssWidth: 640, cssHeight: 640, dpr: 1 },
  };
}

async function mountKiosk() {
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="panel-1" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

beforeEach(() => {
  shaderCovered.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp background under an opaque tile', () => {
  it('covers the shader while a photo fills round glass', async () => {
    fetchMock.mockResolvedValue({ found: true, record: recordWith('kraken', '2x2round') });
    await mountKiosk();
    await waitFor(() => expect(shaderCovered.at(-1)).toBe(true));
    expect(shaderCovered).toContain(false);
  });

  it('keeps it drawing on rect glass, whose rounded card corners show it', async () => {
    fetchMock.mockResolvedValue({ found: true, record: recordWith('lcd-square', '2x2') });
    await mountKiosk();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    expect(shaderCovered.length).toBeGreaterThan(0);
    expect(shaderCovered.every(c => !c)).toBe(true);
  });

  it('keeps it drawing while the photo is letterboxed', async () => {
    fetchMock.mockResolvedValue({ found: true, record: recordWith('kraken', '2x2round', { fit: true }) });
    await mountKiosk();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    expect(shaderCovered.length).toBeGreaterThan(0);
    expect(shaderCovered.every(c => !c)).toBe(true);
  });
});
