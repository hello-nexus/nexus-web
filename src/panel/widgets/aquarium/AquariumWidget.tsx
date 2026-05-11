import type { WidgetProps } from '../types';
import styles from './AquariumWidget.module.scss';

// Fish definitions - each gets unique color, speed, direction, and vertical position
const FISH = [
  { color: '#ff6b6b', speed: 18, y: 15, dir: 'right' as const, delay: 0, size: 1 },
  { color: '#ffd93d', speed: 24, y: 35, dir: 'left' as const, delay: 3, size: 1.2 },
  { color: '#6bcb77', speed: 20, y: 55, dir: 'right' as const, delay: 7, size: 0.9 },
  { color: '#4d96ff', speed: 28, y: 25, dir: 'left' as const, delay: 11, size: 1.1 },
  { color: '#ff922b', speed: 16, y: 70, dir: 'right' as const, delay: 5, size: 1.3 },
  { color: '#cc5de8', speed: 22, y: 45, dir: 'left' as const, delay: 9, size: 0.85 },
];

// Bubble definitions - staggered rising circles
const BUBBLES = [
  { x: 12, size: 5, speed: 12, delay: 0, opacity: 0.5 },
  { x: 28, size: 3, speed: 15, delay: 2, opacity: 0.3 },
  { x: 45, size: 7, speed: 10, delay: 4, opacity: 0.6 },
  { x: 62, size: 4, speed: 14, delay: 1, opacity: 0.4 },
  { x: 78, size: 6, speed: 11, delay: 6, opacity: 0.55 },
  { x: 35, size: 3, speed: 16, delay: 3, opacity: 0.35 },
  { x: 55, size: 8, speed: 9, delay: 5, opacity: 0.7 },
  { x: 88, size: 4, speed: 13, delay: 7, opacity: 0.4 },
  { x: 20, size: 5, speed: 11, delay: 8, opacity: 0.45 },
  { x: 70, size: 3, speed: 15, delay: 2.5, opacity: 0.3 },
];

// Kelp definitions - swaying green shapes at the bottom
const KELP = [
  { x: 15, height: 90, swaySpeed: 4, swayDeg: 6, delay: 0 },
  { x: 38, height: 110, swaySpeed: 5, swayDeg: 8, delay: 1.5 },
  { x: 65, height: 75, swaySpeed: 3.5, swayDeg: 5, delay: 0.8 },
  { x: 85, height: 100, swaySpeed: 4.5, swayDeg: 7, delay: 2 },
];

// Style objects are derived from static data, so precompute them once at
// module load instead of allocating fresh objects on every render.
const FISH_NODES = FISH.map((fish, i) => ({
  key: i,
  className: `${styles.fish} ${fish.dir === 'left' ? styles.fishLeft : styles.fishRight}`,
  wrapperStyle: {
    '--fish-y': `${fish.y}%`,
    '--fish-speed': `${fish.speed}s`,
    '--fish-delay': `-${fish.delay}s`,
    '--fish-scale': fish.size,
  } as React.CSSProperties,
  bodyStyle: { background: fish.color } as React.CSSProperties,
  tailStyle: { borderColor: `transparent transparent transparent ${fish.color}` } as React.CSSProperties,
}));

const BUBBLE_NODES = BUBBLES.map((b, i) => ({
  key: i,
  style: {
    '--bubble-x': `${b.x}%`,
    '--bubble-size': `${b.size}px`,
    '--bubble-speed': `${b.speed}s`,
    '--bubble-delay': `-${b.delay}s`,
    '--bubble-opacity': b.opacity,
  } as React.CSSProperties,
}));

const KELP_NODES = KELP.map((k, i) => ({
  key: i,
  style: {
    '--kelp-x': `${k.x}%`,
    '--kelp-height': `${k.height}px`,
    '--kelp-sway-speed': `${k.swaySpeed}s`,
    '--kelp-sway-deg': `${k.swayDeg}deg`,
    '--kelp-delay': `-${k.delay}s`,
  } as React.CSSProperties,
}));

export function AquariumWidget({ widget }: WidgetProps) {
  void widget;

  return (
    <div className={styles.tank}>
      {/* Ambient surface light */}
      <div className={styles.surfaceLight} />

      {FISH_NODES.map(node => (
        <div key={node.key} className={node.className} style={node.wrapperStyle}>
          <div className={styles.fishBody} style={node.bodyStyle}>
            <div className={styles.fishEye} />
          </div>
          <div className={styles.fishTail} style={node.tailStyle} />
        </div>
      ))}

      {BUBBLE_NODES.map(node => (
        <div key={node.key} className={styles.bubble} style={node.style} />
      ))}

      {KELP_NODES.map(node => (
        <div key={node.key} className={styles.kelp} style={node.style} />
      ))}

      {/* Sandy bottom */}
      <div className={styles.sand} />
    </div>
  );
}

export default AquariumWidget;
