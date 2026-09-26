import type { DateFormat } from '../../../../lib/units';

// Horizontal renders HH:MM[:SS] on one line; stacked drops the colons and puts
// each unit on its own line, which fills a tall or square tile.
export type ClockLayout = 'horizontal' | 'stacked';

export interface ClockDesignProps {
  now: Date;
  tz?: string;
  showSeconds: boolean;
  showDate: boolean;
  showTimezone: boolean;
  dateFormat: DateFormat;
  size: string;
  hour12: boolean;
  useAccentColor: boolean;
  layout: ClockLayout;
}
