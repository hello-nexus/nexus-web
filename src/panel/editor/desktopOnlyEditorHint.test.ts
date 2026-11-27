// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calendarApp } from '../widgets/calendar';
import { desktopOnlyEditorHintFor } from './desktopOnlyEditorHint';

const meta = { desktopOnlyHintKey: 'some.key' };

describe('desktopOnlyEditorHintFor', () => {
  it('applies on every panel surface, pointer-driven ones included', () => {
    for (const surface of ['y70', 'phone', 'q60', 'monitor', 'lcd-round'] as const) {
      expect(desktopOnlyEditorHintFor(meta, surface)).toBe('some.key');
    }
  });

  it('stays off the desktop dashboard', () => {
    expect(desktopOnlyEditorHintFor(meta, 'desktop')).toBeNull();
  });

  it('is opt-in per app', () => {
    expect(desktopOnlyEditorHintFor({}, 'y70')).toBeNull();
    expect(desktopOnlyEditorHintFor(undefined, 'y70')).toBeNull();
  });

  it('is declared by the calendar widget', () => {
    expect(desktopOnlyEditorHintFor(calendarApp.meta, 'y70')).toBe('panel.widget.calendar.desktopOnlyHint');
  });
});
