// Clock — settings-driven wall clock. Exercises useSettings (live host-pushed
// config) + Intl time formatting in the worker. Covers the text designs
// (digital/led/rolling); analog/dots need an SVG primitive (future ui element).

import { mount, useSettings, useTick } from '@hellonexus/sdk';
import { Stack, Text } from '@hellonexus/ui';
import type { UiTone } from '../../../src/sandbox/contract/elements';

interface ClockSettings {
  design?: string;
  format?: string;
  showSeconds?: boolean;
  showDate?: boolean;
  useAccentColor?: boolean;
  timezone?: string;
}

function formatNow(now: number, s: ClockSettings) {
  const timeZone = s.timezone || undefined;
  const hour12 = s.format === '12h';
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit',
    ...(s.showSeconds ? { second: '2-digit' } : {}),
    hour12, timeZone,
  }).format(now);
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone,
  }).format(now);
  return { time, date };
}

function Clock() {
  const settings = useSettings<ClockSettings>();
  const now = useTick(settings.showSeconds ? 1000 : 1000);
  const { time, date } = formatNow(now, settings);
  const design = settings.design ?? 'digital';
  const isLed = design === 'led';
  const mono = design === 'led' || design === 'rolling';
  const timeTone: UiTone = isLed ? 'accent-glow' : settings.useAccentColor ? 'accent' : 'text';

  return (
    <Stack direction="column" padding={10} gap={6} align="center" justify="center" grow>
      <Text value={time} size={isLed ? 36 : 41} weight={isLed ? 'light' : 'black'} tone={timeTone} mono={mono} lineHeight={1} />
      {settings.showDate !== false && (
        <Text value={date} size={12} weight="medium" transform="uppercase" tone="text-faded" letterSpacing={0.05} />
      )}
    </Stack>
  );
}

mount(Clock);
