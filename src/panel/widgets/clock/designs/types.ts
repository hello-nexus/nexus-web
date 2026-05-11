export interface ClockDesignProps {
  now: Date;
  tz?: string;
  showSeconds: boolean;
  showDate: boolean;
  size: string;
  hour12: boolean;
  useAccentColor: boolean;
}
