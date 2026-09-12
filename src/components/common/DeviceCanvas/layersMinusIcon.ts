import { createLucideIcon } from 'lucide-react';

// lucide ships layers-plus but no layers-minus: this is layers-plus with the
// vertical stroke of the plus dropped, so the stack and unstack rows pair.
export const LayersMinus = createLucideIcon('LayersMinus', [
  ['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.831z', key: 'top' }],
  ['path', { d: 'M16 17h6', key: 'minus' }],
  ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 .825.178', key: 'mid' }],
  ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l2.116-.962', key: 'base' }],
]);
