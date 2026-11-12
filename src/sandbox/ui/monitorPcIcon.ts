import { createLucideIcon } from 'lucide-react';

// The pinned lucide-react has no monitor-pc; these paths are copied from lucide's monitor-pc.
export const MonitorPc = createLucideIcon('MonitorPc', [
  ['path', { d: 'M10 15H4a2 2 0 01-2-2V7a2 2 0 012-2h6', key: 'screen' }],
  ['path', { d: 'M10 19H5', key: 'base' }],
  ['path', { d: 'M14 11h8', key: 'bay2' }],
  ['path', { d: 'M14 7h8', key: 'bay1' }],
  ['path', { d: 'M18 17h.01', key: 'led' }],
  ['path', { d: 'M9 19v-4', key: 'stand' }],
  ['rect', { x: '14', y: '3', width: '8', height: '18', rx: '1', key: 'case' }],
]);
