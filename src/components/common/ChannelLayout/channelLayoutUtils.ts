/** A position around the listener: x runs left (-1) to right (1), y runs front (-1) to back (1). */
export interface ChannelPos { x: number; y: number }

/** Which side of its node a control sits on: above for a node near the center line, else toward the nearer edge. */
export function controlSide(x: number): 'top' | 'left' | 'right' {
  if (Math.abs(x) < 0.2) return 'top';
  return x < 0 ? 'left' : 'right';
}
