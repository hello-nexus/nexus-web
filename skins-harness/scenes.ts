import type { PanelWidget } from '../src/panel/types';

// Real widgets only; each renders from its own preview fixture.
const w = (id: string, type: string, size: PanelWidget['size'], col: number, row: number, config?: PanelWidget['config']): PanelWidget =>
  ({ id, type, size, col, row, config });

export const SCENES: Array<{ id: string; label: string; widgets: PanelWidget[]; gauges?: boolean; chrome?: boolean }> = [
  {
    id: 'main',
    label: 'Main',
    widgets: [
      w('clock', 'clock', '2x2', 0, 0),
      w('mon', 'monitoring', '2x2', 2, 0),
      w('weather', 'weather', '2x2', 0, 2),
      w('cal', 'calendar', '2x2', 2, 2),
    ],
  },
  {
    id: 'media',
    label: 'Media + stocks',
    widgets: [
      w('media', 'media', '4x2', 0, 0),
      w('stocks', 'stocks', '4x2', 0, 2),
    ],
  },
  {
    id: 'gauges',
    label: 'Gauges',
    widgets: [],
    gauges: true,
  },
  {
    id: 'utility',
    label: 'Utility',
    widgets: [
      w('timer', 'timer', '2x2', 0, 0),
      w('stopwatch', 'stopwatch', '2x2', 2, 0),
      w('screen', 'screentime', '2x2', 0, 2),
      w('transfer', 'transfer', '2x2', 2, 2),
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    widgets: [
      w('displays', 'displays', '4x2', 0, 0),
      w('lights', 'smart-lights', '4x2', 0, 2),
    ],
  },
  {
    id: 'big',
    label: 'Big tiles',
    widgets: [w('mon4', 'monitoring', '4x2', 0, 0), w('diag', 'diagnostics', '2x2', 0, 2), w('clock4', 'clock', '2x2', 2, 2)],
  },
  { id: 'chrome', label: 'Chrome', widgets: [], chrome: true },
];
