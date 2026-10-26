import { describe, expect, it } from 'vitest';
import type { PanelDeviceRecord } from '../../api/panel';
import { panelShortSideSlots } from '../types';
import { densityShortSideSlots } from './panelGrid';
import { recordWidgetSizeOf } from './recordWidgetSize';

const caps = { surface: 'monitor', cssWidth: 1920, cssHeight: 1080, dpr: 1, dpi: 96 };
const density = densityShortSideSlots(1920, 1080, 1, 96);
const record = (over: Partial<PanelDeviceRecord>) => ({ displayId: 'd1', capabilities: caps, ...over }) as PanelDeviceRecord;

describe('recordWidgetSizeOf', () => {
  it('keeps a stored size', () => {
    expect(recordWidgetSizeOf(record({ widgetSize: 'large', gridSlots: density * 2 }), 'monitor')).toBe('large');
  });

  it('reads a retired grid density as the nearest size, so the editor and the kiosk share one grid', () => {
    const legacy = record({ gridSlots: density * 2 });
    const size = recordWidgetSizeOf(legacy, 'monitor');
    expect(size).toBe('xsmall');
    expect(panelShortSideSlots('monitor', undefined, size, density)).not.toBe(panelShortSideSlots('monitor', undefined, undefined, density));
  });

  it('leaves other panels on their default', () => {
    expect(recordWidgetSizeOf(record({ gridSlots: 4, capabilities: { ...caps, family: 'x' } as PanelDeviceRecord['capabilities'] }), 'monitor')).toBeUndefined();
    expect(recordWidgetSizeOf(record({ gridSlots: 4, displayId: undefined }), 'monitor')).toBeUndefined();
  });
});
