// The Windows overlay host drops WS_EX_NOACTIVATE only on setActivatable, so
// text fields in the edit sheet can take keystrokes only while it is open.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostMessage } from './hostBridge';

const posted: HostMessage[] = [];
const widgets = vi.hoisted(() => ({
  list: [{ id: 'w1', type: 'stub', size: '2x2', monitor: 0, col: 0, row: 0 }],
  onPrefs: null as null | (() => void),
}));

vi.mock('./hostBridge', () => ({
  postToHost: (msg: HostMessage) => { posted.push(msg); },
}));
vi.mock('../api/overlay', () => ({
  listOverlayWidgets: vi.fn(async () => widgets.list),
  patchOverlayWidget: vi.fn(async () => null),
  deleteOverlayWidget: vi.fn(async () => true),
  setAllOverlayWidgetsLocked: vi.fn(async () => null),
}));
vi.mock('../api/service', () => ({
  fetchService: vi.fn(async () => null),
  postService: vi.fn(async () => null),
}));
vi.mock('../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, _enabled: boolean, cb: () => void) => {
    if (topic === 'prefs') widgets.onPrefs = cb;
  },
}));
vi.mock('../panel/widgets/registry', () => ({
  APP_REGISTRY: { stub: { meta: {}, Widget: () => null, Settings: () => null } },
  sizesForSurface: () => ['2x2'],
}));
vi.mock('../panel/widgets/common/WidgetContextMenu', () => ({
  WidgetContextMenu: ({ onEdit }: { onEdit: () => void }) => (
    <button type="button" onClick={onEdit}>edit</button>
  ),
}));
vi.mock('../panel/widgets/common/WidgetEditSheet', () => ({
  WidgetEditSheet: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>close</button>
  ),
}));

import OverlayShell from './OverlayShell';

const activatable = () => posted
  .filter((m): m is Extract<HostMessage, { type: 'setActivatable' }> => m.type === 'setActivatable')
  .map(m => m.value);

describe('OverlayShell activation', () => {
  beforeEach(() => {
    posted.length = 0;
    widgets.list = [{ id: 'w1', type: 'stub', size: '2x2', monitor: 0, col: 0, row: 0 }];
  });

  async function openEditor() {
    const { container } = render(<OverlayShell />);
    const tile = await vi.waitFor(() => {
      const el = container.querySelector('[data-widget-id="w1"]');
      if (!el) throw new Error('tile not rendered');
      return el;
    });
    expect(activatable()).toEqual([false]);
    fireEvent.contextMenu(tile);
    await act(async () => { fireEvent.click(screen.getByText('edit')); });
    expect(activatable()).toEqual([false, true]);
  }

  it('is activatable only while the edit sheet is open', async () => {
    await openEditor();

    await act(async () => { fireEvent.click(screen.getByText('close')); });
    expect(activatable()).toEqual([false, true, false]);
  });

  it('stops being activatable when the edited widget is deleted elsewhere', async () => {
    await openEditor();
    widgets.list = [];
    await act(async () => { widgets.onPrefs?.(); });
    await vi.waitFor(() => expect(activatable()).toEqual([false, true, false]));
    expect(screen.queryByText('close')).toBeNull();
  });

  it('keeps the sheet closed when a vanished widget comes back', async () => {
    await openEditor();
    const entry = widgets.list[0];
    widgets.list = [];
    await act(async () => { widgets.onPrefs?.(); });
    await vi.waitFor(() => expect(activatable()).toEqual([false, true, false]));
    widgets.list = [entry];
    await act(async () => { widgets.onPrefs?.(); });
    await vi.waitFor(() => expect(document.querySelector('[data-widget-id="w1"]')).not.toBeNull());
    expect(screen.queryByText('close')).toBeNull();
    expect(activatable()).toEqual([false, true, false]);
  });
});
