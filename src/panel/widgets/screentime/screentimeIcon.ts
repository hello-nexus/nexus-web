import { createLucideIcon } from 'lucide-react';

// Screen Time glyph: lucide's Monitor frame with ascending usage bars inside.
// Built via createLucideIcon so it carries the standard LucideIcon contract
// (size/stroke props) everywhere a manifest icon is rendered.
export const ScreenTimeIcon = createLucideIcon('ScreenTime', [
  ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2', key: 'frame' }],
  ['line', { x1: '8', x2: '16', y1: '21', y2: '21', key: 'base' }],
  ['line', { x1: '12', x2: '12', y1: '17', y2: '21', key: 'neck' }],
  ['path', { d: 'M8 13v-2', key: 'bar1' }],
  ['path', { d: 'M12 13v-4', key: 'bar2' }],
  ['path', { d: 'M16 13v-6', key: 'bar3' }],
]);
