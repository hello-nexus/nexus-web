import { describe, expect, it } from 'vitest';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { SENSOR_CATEGORIES } from '../../../panel/widgets/monitoring/sensorCategories';
import {
  applyDockedOverlayLayout,
  clampUnit,
  dockedOverlayItemPosition,
  formatTryxStorageFreePercent,
  isTryxOverlayAlign,
  isTryxSensorGroup,
  scalePanelMetric,
  tryxFontCssStyle,
  tryxOverlayJustifyStyle,
  formatTryxSensorValue,
  tryxOverlayPreviewValue,
  tryxSensorOptionsForGroup,
  tryxSensorPlaceholder,
  tryxStorageFreePercent,
  TRYX_FONTS,
  TRYX_FONT_LABEL_KEYS,
  TRYX_LABEL_FONT_PANEL_PX,
  TRYX_LABEL_OFFSET_PANEL_PX,
  TRYX_OVERLAY_ALIGNS,
  TRYX_SENSOR_GROUPS,
  TRYX_STORAGE_CAPACITY_BYTES,
  TRYX_VALUE_FONT_PANEL_PX,
  type TryxSensorsByGroup,
} from './tryxOverlayUtils';

describe('clampUnit', () => {
  it('clamps to 0..1', () => {
    expect(clampUnit(-0.5)).toBe(0);
    expect(clampUnit(1.5)).toBe(1);
    expect(clampUnit(0.42)).toBe(0.42);
  });
});

describe('TRYX_FONTS / TRYX_FONT_LABEL_KEYS', () => {
  it('has exactly the 9 documented font options, each with a label key', () => {
    expect(TRYX_FONTS).toEqual([
      'roboto-regular', 'roboto-thin', 'roboto-light', 'roboto-medium',
      'roboto-bold', 'roboto-black', 'roboto-italic', 'roboto-condensed', 'monospace',
    ]);
    for (const font of TRYX_FONTS) {
      expect(TRYX_FONT_LABEL_KEYS[font]).toMatch(/^devices\.tryx\.font/);
    }
  });
});

describe('tryxFontCssStyle', () => {
  it('maps weight keywords to their numeric CSS weight', () => {
    expect(tryxFontCssStyle('roboto-thin').fontWeight).toBe(100);
    expect(tryxFontCssStyle('roboto-light').fontWeight).toBe(300);
    expect(tryxFontCssStyle('roboto-regular').fontWeight).toBe(400);
    expect(tryxFontCssStyle('roboto-medium').fontWeight).toBe(500);
    expect(tryxFontCssStyle('roboto-bold').fontWeight).toBe(700);
    expect(tryxFontCssStyle('roboto-black').fontWeight).toBe(900);
  });

  it('sets italic style only for roboto-italic', () => {
    expect(tryxFontCssStyle('roboto-italic').fontStyle).toBe('italic');
    expect(tryxFontCssStyle('roboto-regular').fontStyle).toBeUndefined();
  });

  it('uses the monospace font family only for monospace', () => {
    expect(tryxFontCssStyle('monospace').fontFamily).toBe('var(--font-mono)');
    expect(tryxFontCssStyle('roboto-regular').fontFamily).toBe('var(--font-sans)');
  });

  it('falls back to the regular style for an unknown font value', () => {
    expect(tryxFontCssStyle('not-a-font')).toEqual(tryxFontCssStyle('roboto-regular'));
  });
});

describe('scalePanelMetric', () => {
  it('scales the panel constant by size percent and preview height', () => {
    // At 100% size, a 1080px-tall preview reproduces the panel px 1:1.
    expect(scalePanelMetric(TRYX_VALUE_FONT_PANEL_PX, 100, 1080)).toBeCloseTo(130);
    expect(scalePanelMetric(TRYX_LABEL_FONT_PANEL_PX, 100, 1080)).toBeCloseTo(52);
    expect(scalePanelMetric(TRYX_LABEL_OFFSET_PANEL_PX, 100, 1080)).toBeCloseTo(150);
  });

  it('scales linearly with the size percent', () => {
    expect(scalePanelMetric(130, 50, 1080)).toBeCloseTo(65);
    expect(scalePanelMetric(130, 150, 1080)).toBeCloseTo(195);
  });

  it('scales linearly with a smaller preview height', () => {
    expect(scalePanelMetric(130, 100, 540)).toBeCloseTo(65);
  });
});

describe('isTryxOverlayAlign', () => {
  it('accepts exactly left/center/right', () => {
    expect(TRYX_OVERLAY_ALIGNS).toEqual(['left', 'center', 'right']);
    for (const align of TRYX_OVERLAY_ALIGNS) expect(isTryxOverlayAlign(align)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isTryxOverlayAlign('middle')).toBe(false);
    expect(isTryxOverlayAlign(undefined)).toBe(false);
    expect(isTryxOverlayAlign(1)).toBe(false);
  });
});

describe('tryxOverlayJustifyStyle', () => {
  it('left has no transform and left text-align', () => {
    expect(tryxOverlayJustifyStyle('left')).toEqual({ textAlign: 'left' });
  });

  it('center shifts left 50% and centers the text', () => {
    expect(tryxOverlayJustifyStyle('center')).toEqual({ textAlign: 'center', transform: 'translateX(-50%)' });
  });

  it('right shifts left 100% and right-aligns the text', () => {
    expect(tryxOverlayJustifyStyle('right')).toEqual({ textAlign: 'right', transform: 'translateX(-100%)' });
  });
});

describe('dockedOverlayItemPosition', () => {
  it('anchors x per alignment', () => {
    expect(dockedOverlayItemPosition('left', 0, 1).x).toBeCloseTo(0.04);
    expect(dockedOverlayItemPosition('center', 0, 1).x).toBeCloseTo(0.5);
    expect(dockedOverlayItemPosition('right', 0, 1).x).toBeCloseTo(0.96);
  });

  it('centers the stack vertically by enabled count, 0.24 apart', () => {
    // One stat sits near the vertical center; four fill the panel evenly.
    expect(dockedOverlayItemPosition('left', 0, 1).y).toBeCloseTo(0.38);
    expect(dockedOverlayItemPosition('left', 0, 4).y).toBeCloseTo(0.02);
    expect(dockedOverlayItemPosition('left', 1, 4).y).toBeCloseTo(0.26);
    expect(dockedOverlayItemPosition('left', 2, 4).y).toBeCloseTo(0.50);
    expect(dockedOverlayItemPosition('right', 3, 4).y).toBeCloseTo(0.74);
  });
});

describe('applyDockedOverlayLayout', () => {
  it('recomputes positions only for enabled items, in slot order, centered', () => {
    const items = [
      { enabled: true, x: 0.11, y: 0.22 },
      { enabled: false, x: 0.33, y: 0.44 },
      { enabled: true, x: 0.55, y: 0.66 },
    ];
    const next = applyDockedOverlayLayout(items, 'left');
    // Two enabled stats: the stack (2 * 0.24) is centered on 0.5, so it starts at 0.30.
    expect(next[0].enabled).toBe(true);
    expect(next[0].x).toBeCloseTo(0.04);
    expect(next[0].y).toBeCloseTo(0.26);
    // Disabled item is left untouched.
    expect(next[1]).toEqual({ enabled: false, x: 0.33, y: 0.44 });
    // Second ENABLED item gets enabled-index 1, one step down.
    expect(next[2].enabled).toBe(true);
    expect(next[2].x).toBeCloseTo(0.04);
    expect(next[2].y).toBeCloseTo(0.50);
  });

  it('centers a single docked stat vertically and re-anchors x by align', () => {
    const items = [{ enabled: true, x: 0.04, y: 0.10 }];
    expect(applyDockedOverlayLayout(items, 'right')[0]).toEqual({ enabled: true, x: 0.96, y: 0.38 });
  });
});

describe('isTryxSensorGroup', () => {
  it('accepts exactly the 8 monitoring groups, matching SENSOR_CATEGORIES', () => {
    expect(TRYX_SENSOR_GROUPS).toEqual(SENSOR_CATEGORIES);
    expect(TRYX_SENSOR_GROUPS).toEqual(['quick', 'cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network', 'fps']);
    for (const group of TRYX_SENSOR_GROUPS) expect(isTryxSensorGroup(group)).toBe(true);
  });

  it('rejects an unrelated string', () => {
    expect(isTryxSensorGroup('fan')).toBe(false);
    expect(isTryxSensorGroup(undefined)).toBe(false);
  });
});

function sensor(partial: Partial<HardwareSensor> & { id: string; name: string; type: string }): HardwareSensor {
  return { value: 0, units: '', formatted: '', parent: { id: '', name: '' }, ...partial };
}

describe('tryxSensorOptionsForGroup', () => {
  it('strips the device-name prefix and appends the sensor type', () => {
    const sensorsByGroup: TryxSensorsByGroup = {
      quick: [],
      cpu: [sensor({ id: 'cpu-temp', name: 'CPU Package', type: 'Temperature' })],
      gpu: [],
      memory: [],
      motherboard: [],
      storage: [],
      network: [],
      fps: [],
    };
    const options = tryxSensorOptionsForGroup('cpu', sensorsByGroup);
    expect(options).toEqual([
      { value: 'cpu-temp', bareLabel: 'Package', prefixedLabel: 'CPU Package', type: 'Temperature', optionLabel: 'Package (Temperature)' },
    ]);
  });

  it('does not strip a prefix for the motherboard group', () => {
    const sensorsByGroup: TryxSensorsByGroup = {
      quick: [], cpu: [], gpu: [], memory: [], storage: [], network: [], fps: [],
      motherboard: [sensor({ id: 'fan-1', name: 'Fan 1', type: 'Fan' })],
    };
    const options = tryxSensorOptionsForGroup('motherboard', sensorsByGroup);
    expect(options).toEqual([
      { value: 'fan-1', bareLabel: 'Fan 1', prefixedLabel: 'Fan 1', type: 'Fan', optionLabel: 'Fan 1 (Fan)' },
    ]);
  });

  it('does not strip a prefix for the fps group', () => {
    const sensorsByGroup: TryxSensorsByGroup = {
      quick: [], cpu: [], gpu: [], memory: [], motherboard: [], storage: [], network: [],
      fps: [sensor({ id: 'fps/current', name: 'FPS', type: 'Framerate' })],
    };
    const options = tryxSensorOptionsForGroup('fps', sensorsByGroup);
    expect(options).toEqual([
      { value: 'fps/current', bareLabel: 'FPS', prefixedLabel: 'FPS', type: 'Framerate', optionLabel: 'FPS (Framerate)' },
    ]);
  });

  it('does not strip a prefix and drops the type suffix for the quick group', () => {
    const sensorsByGroup: TryxSensorsByGroup = {
      quick: [sensor({ id: 'summary/cpu-temp', name: 'CPU Temperature', type: 'Temperature' })],
      cpu: [], gpu: [], memory: [], motherboard: [], storage: [], network: [], fps: [],
    };
    const options = tryxSensorOptionsForGroup('quick', sensorsByGroup);
    expect(options).toEqual([
      { value: 'summary/cpu-temp', bareLabel: 'CPU Temperature', prefixedLabel: 'CPU Temperature', type: 'Temperature', optionLabel: 'CPU Temperature' },
    ]);
  });

  it('dedupes sensors sharing an id and skips ids missing entirely', () => {
    const sensorsByGroup: TryxSensorsByGroup = {
      quick: [],
      cpu: [
        sensor({ id: 'x', name: 'CPU Total', type: 'Load' }),
        sensor({ id: 'x', name: 'CPU Total dup', type: 'Load' }),
        sensor({ id: '', name: 'No id', type: 'Load' }),
      ],
      gpu: [], memory: [], motherboard: [], storage: [], network: [], fps: [],
    };
    expect(tryxSensorOptionsForGroup('cpu', sensorsByGroup)).toHaveLength(1);
  });
});

describe('tryxSensorPlaceholder', () => {
  it('returns a representative placeholder per sensor type', () => {
    expect(tryxSensorPlaceholder('Temperature')).toBe('45°C');
    expect(tryxSensorPlaceholder('Load')).toBe('34%');
    expect(tryxSensorPlaceholder('Voltage')).toBe('1.25V');
    expect(tryxSensorPlaceholder('Framerate')).toBe('60fps');
    expect(tryxSensorPlaceholder('FrameTime')).toBe('16.7ms');
  });

  it('falls back to a dash for an unrecognized type', () => {
    expect(tryxSensorPlaceholder('Unknown')).toBe('--');
  });
});

describe('formatTryxSensorValue', () => {
  it('rounds whole-number types to integers (matches the panel firmware)', () => {
    expect(formatTryxSensorValue('Temperature', 52.4)).toBe('52°C');
    expect(formatTryxSensorValue('Load', 33.6)).toBe('34%');
    expect(formatTryxSensorValue('Clock', 4699.8)).toBe('4700MHz');
    expect(formatTryxSensorValue('Frequency', 5999.5)).toBe('6000MHz');
    expect(formatTryxSensorValue('SmallData', 511.6)).toBe('512MB');
    expect(formatTryxSensorValue('Power', 64.7)).toBe('65W');
    expect(formatTryxSensorValue('Fan', 1199.4)).toBe('1199RPM');
  });

  it('keeps fixed decimals for voltage/data', () => {
    expect(formatTryxSensorValue('Voltage', 1.234)).toBe('1.23V');
    expect(formatTryxSensorValue('Data', 12.94)).toBe('12.9GB');
  });

  it('scales throughput bytes/sec to a readable unit (matches the service)', () => {
    expect(formatTryxSensorValue('Throughput', 12_000_000)).toBe('11.4MB/s');
    expect(formatTryxSensorValue('Throughput', 50_000)).toBe('48.8KB/s');
    expect(formatTryxSensorValue('Throughput', 512)).toBe('512B/s');
  });

  it('mirrors the service fps formats (round fps, 1-decimal frame time)', () => {
    expect(formatTryxSensorValue('Framerate', 59.6)).toBe('60fps');
    expect(formatTryxSensorValue('FrameTime', 16.66)).toBe('16.7ms');
  });
});

describe('tryxStorageFreePercent / formatTryxStorageFreePercent', () => {
  it('computes remaining percent against the fixed 2 GiB capacity', () => {
    expect(tryxStorageFreePercent(50305560)).toBeCloseTo(97.657, 3);
    expect(formatTryxStorageFreePercent(50305560)).toBe('97.7%');
  });

  it('reports 100% free at zero bytes used', () => {
    expect(tryxStorageFreePercent(0)).toBe(100);
    expect(formatTryxStorageFreePercent(0)).toBe('100.0%');
  });

  it('reports 0% free once used bytes reach capacity', () => {
    expect(tryxStorageFreePercent(TRYX_STORAGE_CAPACITY_BYTES)).toBe(0);
    expect(formatTryxStorageFreePercent(TRYX_STORAGE_CAPACITY_BYTES)).toBe('0.0%');
  });

  it('clamps to 0 rather than going negative when used exceeds capacity', () => {
    expect(tryxStorageFreePercent(TRYX_STORAGE_CAPACITY_BYTES * 2)).toBe(0);
  });
});

describe('tryxOverlayPreviewValue', () => {
  const sensorsByGroup: TryxSensorsByGroup = {
    quick: [],
    cpu: [sensor({ id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 52.4, formatted: '52.4 °C' })],
    gpu: [], memory: [], motherboard: [], storage: [], network: [],
    fps: [sensor({ id: 'fps/current', name: 'FPS', type: 'Framerate', value: 59.6, formatted: '60' })],
  };

  it('formats the live value with the panel firmware rounding, not the monitoring string', () => {
    expect(tryxOverlayPreviewValue('cpu', 'cpu-temp', 'Temperature', sensorsByGroup)).toBe('52°C');
  });

  it('falls back to a type-appropriate placeholder when the sensor is not live', () => {
    expect(tryxOverlayPreviewValue('cpu', 'missing-id', 'Load', sensorsByGroup)).toBe('34%');
  });

  it('formats a live fps sensor with the panel firmware rounding', () => {
    expect(tryxOverlayPreviewValue('fps', 'fps/current', 'Framerate', sensorsByGroup)).toBe('60fps');
  });

  it('falls back to the fps placeholder when the sensor is not live', () => {
    expect(tryxOverlayPreviewValue('fps', 'missing-id', 'FrameTime', sensorsByGroup)).toBe('16.7ms');
  });
});
