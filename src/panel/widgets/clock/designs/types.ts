export interface ClockDesignProps {
  now: Date;
  tz?: string;
  showSeconds: boolean;
  showDate: boolean;
  showTimezone: boolean;
  size: string;
  hour12: boolean;
  useAccentColor: boolean;
}
