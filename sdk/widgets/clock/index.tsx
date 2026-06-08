// Clock — full-fidelity SDK widget. The cell renders <ClockFace>, the page
// renders <WorldClock>; both are blessed composites the host draws with the
// SAME pure components the native clock widget uses (the 8 clock designs, the
// day/night WorldClockMap), so this is pixel-identical to native with zero
// duplication. The worker only orchestrates: reads settings, ticks, and picks
// inputs. mount({ cell, page }) gives one bundle two surfaces — the page worker
// is a separate render of this same code, opened from the dashboard section route.

import { mount, useSettings, useSize, useTick } from '@hellonexus/sdk';
import { Stack, ClockFace, ViewHeader, WorldClock } from '@hellonexus/ui';

interface ClockSettings {
  design?: string;
  format?: string;
  showSeconds?: boolean;
  showDate?: boolean;
  useAccentColor?: boolean;
  timezone?: string;
}

// Map the rendered pixel tile to the design's grid-size bucket (the designs
// scale typography off this). The worker has pixels, not the grid string.
function sizeBucket(w: number, h: number): string {
  if (w >= 360 && h >= 320) return '4x4';
  if (w >= 360) return '4x2';
  return '2x2';
}

function ClockCell() {
  const s = useSettings<ClockSettings>();
  const { width, height } = useSize();
  // 1s tick so the analog second hand sweeps and seconds (when shown) advance.
  const now = useTick(1000);
  return (
    <ClockFace
      nowMs={now}
      design={s.design ?? 'digital'}
      tz={s.timezone || undefined}
      showSeconds={!!s.showSeconds}
      showDate={s.showDate !== false}
      hour12={s.format === '12h'}
      useAccentColor={!!s.useAccentColor}
      size={sizeBucket(width, height)}
    />
  );
}

// The page is a first-class native page: the standard ViewHeader (the title
// shows in the top bar; tabs would render here) over the full day/night world
// map + scrollable city list — the same components the native clock page uses.
function ClockPageView() {
  const s = useSettings<ClockSettings>();
  return (
    <Stack direction="column" grow>
      <ViewHeader title="Clock" />
      <WorldClock highlightTz={s.timezone || undefined} />
    </Stack>
  );
}

mount({ cell: ClockCell, page: ClockPageView });
