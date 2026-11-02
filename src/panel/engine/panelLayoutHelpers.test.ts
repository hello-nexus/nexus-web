import { describe, expect, it } from 'vitest';
import { isPanelBackgroundTarget } from './panelLayoutHelpers';

describe('isPanelBackgroundTarget', () => {
  it('is the empty background but not a widget, a control, a scroll pane or panel chrome', () => {
    document.body.innerHTML = '<div id="bg"><div id="grid"></div><div data-panel-widget-id="w"><span id="in-widget"></span></div><button><i id="in-button"></i></button><div data-panel-scrollable="true"><b id="in-scroll"></b></div><div data-panel-hit="true"><u id="in-chrome"></u></div></div>';
    const at = (id: string) => document.getElementById(id);
    expect(isPanelBackgroundTarget(at('bg'))).toBe(true);
    expect(isPanelBackgroundTarget(at('grid'))).toBe(true);
    for (const id of ['in-widget', 'in-button', 'in-scroll', 'in-chrome']) expect(isPanelBackgroundTarget(at(id)), id).toBe(false);
    expect(isPanelBackgroundTarget(null)).toBe(false);
  });
});
