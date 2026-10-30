import { describe, expect, it } from 'vitest';
import { clickOpensBackgroundMenu } from './panelLayoutHelpers';

function dom() {
  document.body.innerHTML = '<div id="bg"></div><div data-panel-widget-id="w"><span id="in"></span></div>';
  return { bg: document.getElementById('bg')!, widgetChild: document.getElementById('in')! };
}

describe('clickOpensBackgroundMenu', () => {
  it('opens for a press and a click that both landed on the background', () => {
    expect(clickOpensBackgroundMenu(true, dom().bg)).toBe(true);
  });

  it('does not open when the press began on a widget and the click ended on the background', () => {
    expect(clickOpensBackgroundMenu(false, dom().bg)).toBe(false);
  });

  it('opens for a keyboard click with no press, and never for a click on a widget', () => {
    const { bg, widgetChild } = dom();
    expect(clickOpensBackgroundMenu(null, bg)).toBe(true);
    expect(clickOpensBackgroundMenu(true, widgetChild)).toBe(false);
  });
});
