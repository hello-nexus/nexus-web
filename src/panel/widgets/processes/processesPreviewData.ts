// Frozen fixture for the add-widget catalog tile: the live widget reads a
// streaming store, and the picker must not animate.
import type { ProcessRow } from './processesData';

export const PROCESSES_PREVIEW: ProcessRow[] = [
  { name: 'chrome',   cpu: 12.4, gpu: 8.2, memMb: 2810 },
  { name: 'Nexus',    cpu: 3.1,  gpu: 1.4, memMb: 214 },
  { name: 'Code',     cpu: 2.7,  gpu: 0.6, memMb: 1640 },
  { name: 'Discord',  cpu: 1.9,  gpu: 2.1, memMb: 720 },
  { name: 'explorer', cpu: 0.8,  gpu: 0.3, memMb: 168 },
  { name: 'Spotify',  cpu: 0.6,  gpu: 0.0, memMb: 342 },
  { name: 'steam',    cpu: 0.4,  gpu: 0.0, memMb: 286 },
  { name: 'dwm',      cpu: 0.3,  gpu: 4.7, memMb: 96 },
];
