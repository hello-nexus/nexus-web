// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { panelEditorRoute, parsePanelEditorTarget, stashPanelEditorTarget, takePanelEditorTarget } from './panelEditorLink';

describe('panelEditorLink', () => {
  it('round-trips a deck key through the route', () => {
    const target = { recordId: 'rec_1', widgetId: 'w-1', deckKey: { page: 2, folderPath: [1, 3], slot: 4 } };
    const route = panelEditorRoute(target);
    expect(route).toBe('/system/panel/rec_1?widget=w-1~2~1.3~4');
    const [path, query] = route.split('?');
    expect(parsePanelEditorTarget(path, `?${query}`)).toEqual(target);
  });

  it('keeps the widget when the key is missing or malformed', () => {
    expect(parsePanelEditorTarget('/system/panel/rec1', '?widget=w1')).toEqual({ recordId: 'rec1', widgetId: 'w1' });
    expect(parsePanelEditorTarget('/system/panel/rec1', '?widget=w1~x~~2')).toEqual({ recordId: 'rec1', widgetId: 'w1' });
  });

  it('ignores other paths and unsafe ids', () => {
    expect(parsePanelEditorTarget('/system/dashboard', '?widget=w1')).toBeNull();
    expect(parsePanelEditorTarget('/system/panel/rec1', '?widget=a%3Cb')).toBeNull();
    expect(parsePanelEditorTarget('/system/panel/rec1', '')).toBeNull();
  });

  it('hands the stashed target once, only to its own record', () => {
    stashPanelEditorTarget('/system/panel/rec1', '?widget=w1');
    expect(takePanelEditorTarget('rec2')).toBeNull();
    expect(takePanelEditorTarget('rec1')).toEqual({ recordId: 'rec1', widgetId: 'w1' });
    expect(takePanelEditorTarget('rec1')).toBeNull();
  });
});
