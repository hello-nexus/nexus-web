import { describe, expect, it, afterEach } from 'vitest';
import { buildEditorDockMotionStyle } from './PanelApp';
import { buildWidgetResizeMotionStyle } from './engine/widgetResizeMotion';
import type { PanelWidget } from './types';

const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const originalMatchMedia = window.matchMedia;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function makeRoot() {
  const root = document.createElement('div');
  root.style.setProperty('--panel-gap', '8px');
  root.style.setProperty('--panel-columns', '4');
  root.style.setProperty('--panel-cell-size', 'calc((100vw - var(--panel-safe-left) - var(--panel-safe-right) - 3 * var(--panel-gap)) / 4)');
  document.body.appendChild(root);
  return root;
}

function makeDesktopRoot() {
  const root = document.createElement('div');
  root.style.setProperty('--panel-gap', '10px');
  root.style.setProperty('--panel-page-padding', '16px');
  root.style.setProperty('--panel-cell-size', '90px');
  Object.defineProperty(root, 'getBoundingClientRect', {
    value: () => ({
      left: 100,
      top: 80,
      right: 1100,
      bottom: 680,
      width: 1000,
      height: 600,
      x: 100,
      y: 80,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(root);
  return root;
}

function forcePortraitOrientation() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('orientation: portrait'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function widget(size: PanelWidget['size']): PanelWidget {
  return {
    id: 'widget-1',
    type: 'clock',
    size,
    col: 0,
    row: 0,
  };
}

describe('buildEditorDockMotionStyle', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setViewport(originalViewport.width, originalViewport.height);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
  });

  it('uses viewport grid math when the cell-size token is a calc expression', () => {
    setViewport(400, 900);
    forcePortraitOrientation();
    const root = makeRoot();

    const style = buildEditorDockMotionStyle(root, widget('2x2'), {
      left: 8,
      top: 8,
      width: 384,
      height: 384,
    }) as Record<string, string>;

    expect(style['--panel-editor-dock-width']).toBe('188px');
    expect(style['--panel-editor-dock-height']).toBe('188px');
  });

  it('does not scale the close target when the slot already matches the resized span', () => {
    setViewport(400, 900);
    forcePortraitOrientation();
    const root = makeRoot();

    const style = buildEditorDockMotionStyle(root, widget('1x1'), {
      left: 8,
      top: 8,
      width: 90,
      height: 90,
    }) as Record<string, string>;

    expect(style['--panel-editor-dock-width']).toBe('90px');
    expect(style['--panel-editor-dock-height']).toBe('90px');
    expect(style['--panel-editor-dock-start-scale-x']).toBe('1.0000');
    expect(style['--panel-editor-dock-start-scale-y']).toBe('1.0000');
  });

  it('keeps the desktop edit dock left of the settings drawer', () => {
    setViewport(1280, 720);
    const root = makeDesktopRoot();

    const style = buildEditorDockMotionStyle(root, widget('4x2'), {
      left: 900,
      top: 120,
      width: 390,
      height: 190,
    }, 'desktop') as Record<string, string>;

    expect(style['--panel-editor-dock-left']).toBe('426px');
    expect(style['--panel-editor-dock-top']).toBe('120px');
    expect(style['--panel-editor-dock-start-x']).toBe('474px');
  });
});

describe('buildWidgetResizeMotionStyle', () => {
  it('scales a context-menu expansion from the previous slot into the new slot', () => {
    const style = buildWidgetResizeMotionStyle(
      { left: 8, top: 16, width: 188, height: 188 },
      { left: 8, top: 16, width: 384, height: 188 },
    ) as Record<string, string>;

    expect(style['--panel-resize-motion-start-x']).toBe('0px');
    expect(style['--panel-resize-motion-start-y']).toBe('0px');
    expect(style['--panel-resize-motion-start-scale-x']).toBe('0.4896');
    expect(style['--panel-resize-motion-start-scale-y']).toBe('1.0000');
  });

  it('scales a context-menu retraction from the current visual rect into the new slot', () => {
    const style = buildWidgetResizeMotionStyle(
      { left: 24, top: 40, width: 384, height: 384 },
      { left: 8, top: 16, width: 188, height: 188 },
    ) as Record<string, string>;

    expect(style['--panel-resize-motion-start-x']).toBe('16px');
    expect(style['--panel-resize-motion-start-y']).toBe('24px');
    expect(style['--panel-resize-motion-start-scale-x']).toBe('2.0426');
    expect(style['--panel-resize-motion-start-scale-y']).toBe('2.0426');
  });
});
