import { describe, expect, it } from 'vitest';
import { appAvailableForSurface } from '../registry';
import { diagnosticsApp } from './index';

describe('diagnostics surfaces', () => {
  it('is offered on touch panels and the dashboard, never on display-only glass', () => {
    const on = (surface: Parameters<typeof appAvailableForSurface>[1], deviceTouch?: boolean) =>
      appAvailableForSurface(diagnosticsApp.meta, surface, { deviceTouch });
    expect(on('desktop')).toBe(true);
    expect(on('y70')).toBe(true);
    expect(on('monitor', true)).toBe(true);
    expect(on('monitor', false)).toBe(false);
    expect(on('q60')).toBe(false);
    expect(on('lcd-wide')).toBe(false);
  });
});
