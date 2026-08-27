// Frozen fixture for the add-widget catalog tile: the live widget reads a
// streaming store, and the picker must not animate. No `gpu` values - the GPU
// column needs a resolved platform ping, which preview gates out, so the
// preview tile is always name + CPU + RAM.
import type { ProcessRow } from './processesData';

export const PROCESSES_PREVIEW: ProcessRow[] = [
  { name: 'chrome',   cpu: 12.4, memMb: 2810 },
  { name: 'Nexus',    cpu: 3.1,  memMb: 214,  gpu: 1.4 },
  { name: 'Code',     cpu: 2.7,  memMb: 1640 },
  { name: 'Discord',  cpu: 1.9,  memMb: 720,  gpu: 2.1 },
  { name: 'explorer', cpu: 0.8,  memMb: 168,  gpu: 0.3 },
  { name: 'Spotify',  cpu: 0.6,  memMb: 342,  gpu: 0.0 },
  { name: 'steam',    cpu: 0.4,  memMb: 286,  gpu: 0.0 },
  { name: 'dwm',      cpu: 0.3,  memMb: 96,   gpu: 4.7 },
];
