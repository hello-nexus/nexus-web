import type { ReactNode } from 'react';
import type { ClockLayout } from './types';
import { useFitWidth } from '../../common/useFitWidth';
import { FitLine } from '../../common/FitLine';
import styles from './layout.module.scss';

// A stacked line is half the width of a horizontal row, so the face may grow
// past its scss size to fill the frame; fit-to-box caps it at the tile.
const STACK_MAX_SCALE = 2.4;

// Tiles a vertical layout fits in. A 4x2 is too short for stacked lines - they
// would scale down to less than the horizontal row they replaced.
export const VERTICAL_LAYOUT_SIZES = ['2x2', '2x4', '4x4'];

// The lines a design renders the time on. Horizontal is a single line with the
// colons inline; stacked splits ON the colons, so they are consumed as the
// separator and each unit (hour, minute, second) gets its own line.
export function splitTimeLines(time: string, layout: ClockLayout): string[] {
  return layout === 'stacked' ? time.split(':') : [time];
}

// Every design fits the same way: horizontal only ever shrinks to the width,
// stacked also fits the height and may grow.
export function useClockFit(stacked: boolean) {
  return useFitWidth(stacked ? STACK_MAX_SCALE : 1, stacked);
}

// The date line, kept to one line: it is fixed-px while a stacked face scales
// to fit, so on a narrow tile it sits right at the wrap threshold and flips
// between one and two lines on a few pixels of tile width. Scaling it down
// instead keeps every surface showing the same thing.
export function ClockDate({ text, className }: { text: string; className?: string }) {
  return <FitLine text={text} className={className} />;
}

// One line of a clock face. AM/PM sits after the digits and is balanced by an
// invisible twin before them, so turning on 12-hour never slides the time off
// centre - and the badge still counts toward the fit, so it cannot be clipped.
export function ClockLine({ ampm, ampmClass, children }: {
  ampm?: string;
  ampmClass?: string;
  children: ReactNode;
}) {
  if (!ampm) return <>{children}</>;

  return (
    <>
      <span className={`${ampmClass ?? ''} ${styles.mirror}`} aria-hidden="true">{ampm}</span>
      {children}
      <span className={ampmClass}>{ampm}</span>
    </>
  );
}
