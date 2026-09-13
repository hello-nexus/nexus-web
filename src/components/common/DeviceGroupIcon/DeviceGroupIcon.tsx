import { CircuitBoard, Fan, Gpu, Lightbulb, type LucideIcon } from 'lucide-react';
import styles from './DeviceGroupIcon.module.scss';

type Look = { glyph: LucideIcon } | { art: string };

const art = (file: string): Look => ({ art: `/assets/devices/${file}` });

// Curated art by device-id prefix, the files the Devices page shows.
const PREFIX_LOOK: ReadonlyArray<readonly [prefix: string, look: Look]> = [
  ['np50:', art('np50.svg')],
  ['smarthub:', art('smarthub.svg')],
  ['minihub:', art('ibuypower.svg')],
  ['ibp:', art('ibuypower.svg')],
  ['lianli', art('lianli.svg')],
  ['corsair:', art('corsair.svg')],
  ['keeb:', art('keeb.svg')],
  ['qseries:', art('q60.svg')],
  ['nzxt-kraken', art('nzxt.svg')],
  ['cnvs:', art('cnvs.svg')],
  ['tryx', art('tryx.svg')],
  ['nollie', art('nollie.svg')],
  ['nvidia', { glyph: Gpu }],
  ['/gpu', { glyph: Gpu }],
];

// The service's iconType: OpenRGB device types, plus the smart-light bulb.
const TYPE_LOOK: Record<string, Look> = {
  motherboard: { glyph: CircuitBoard },
  gpu: { glyph: Gpu },
  dram: art('memory.svg'),
  cooler: { glyph: Fan },
  fan: { glyph: Fan },
  bulb: { glyph: Lightbulb },
  light: { glyph: Lightbulb },
  keyboard: art('keyboard.svg'),
  mouse: art('mouse.svg'),
  headset: art('headset.svg'),
  gamepad: art('gamepad.svg'),
};
const FALLBACK: Look = art('device.svg');

function lookFor(id: string, iconType: string | undefined): Look {
  if (id === 'motherboard') return TYPE_LOOK.motherboard;
  return PREFIX_LOOK.find(([prefix]) => id.startsWith(prefix))?.[1] ?? TYPE_LOOK[iconType ?? ''] ?? FALLBACK;
}

/**
 * The glyph a hardware group's header carries: curated art for a known device
 * id, a generic board / GPU mark or the RAM art for an OpenRGB type, else the generic
 * device. `id` is the group's device id (the cooling rail's `motherboard` block
 * included) and `iconType` the service's type name for its members.
 */
export function DeviceGroupIcon({ id, iconType, className }: { id: string; iconType?: string; className?: string }) {
  const cls = [styles.icon, className].filter(Boolean).join(' ');
  const look = lookFor(id, iconType);
  if ('glyph' in look) return <look.glyph className={cls} aria-hidden />;
  return <span className={`${cls} ${styles.art}`} aria-hidden style={{ ['--icon-url' as string]: `url(${look.art})` }} />;
}

export default DeviceGroupIcon;
